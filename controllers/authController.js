const crypto = require('crypto');
const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { notifyUser, safeSendTemplateEmail } = require('../services/notificationService');
const { buildAppUrl } = require('../utils/appUrl');
const { logActivity, resolveIp } = require('../services/loggingService');
const { generateSecret, verifyTotpCode, encryptSecret, decryptSecret, buildOtpAuthUrl } = require('../utils/totp');
const ReferralCode = require('../models/ReferralCode');
const ReferralEvent = require('../models/ReferralEvent');

const GENERIC_FORGOT_PASSWORD_MESSAGE = 'If an account exists for that email, we sent a reset link.';
const RESET_TOKEN_BYTES = Number(process.env.RESET_PASSWORD_TOKEN_BYTES || 32);
const RESET_TOKEN_TTL_MINUTES = Math.min(60, Math.max(15, Number(process.env.RESET_PASSWORD_EXPIRE_MINUTES || 30)));

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function generateRawResetToken() {
  return crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
}

function buildResetPasswordLink(rawToken, email) {
  const token = encodeURIComponent(rawToken);
  const safeEmail = encodeURIComponent(email);
  return buildAppUrl(`/reset-password?token=${token}&email=${safeEmail}`);
}

function isStrongPassword(password) {
  const value = String(password || '');
  if (value.length < 8) return false;
  if (!/[a-z]/.test(value)) return false;
  if (!/[A-Z]/.test(value)) return false;
  if (!/[0-9]/.test(value)) return false;
  return true;
}

function resetTokenInvalidResponse(res) {
  return res.status(400).json({
    success: false,
    message: 'Reset link is invalid or expired.'
  });
}

function hasValidResetToken(user, incomingTokenHash) {
  if (!user) return false;

  const storedHash = String(user.resetPasswordTokenHash || user.resetPasswordToken || '');
  const expiresAt = user.resetPasswordTokenExpiresAt || user.resetPasswordExpire;
  const usedAt = user.resetPasswordUsedAt || null;

  if (!storedHash || !expiresAt || usedAt) return false;
  if (String(storedHash) !== String(incomingTokenHash)) return false;
  if (new Date(expiresAt).getTime() <= Date.now()) return false;

  return true;
}

function safeAuthResponse(user, token, message = 'Success') {
  return {
    success: true,
    message,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      avatar: user.avatar
    }
  };
}

async function queueVerification(user, actorRole = 'System', templateId = 'verification') {
  const rawToken = user.getVerificationToken();
  await user.save();

  const verificationUrl = buildAppUrl(`/verify-email?token=${rawToken}`);

  try {
    await safeSendTemplateEmail({
      to: user.email,
      templateId,
      context: {
        userName: user.name,
        actionLinks: [{ label: 'Verify Email', url: verificationUrl }]
      },
      metadata: {
        event: 'email.verification.requested',
        userId: user._id.toString()
      }
    });
  } catch (error) {
    console.error('[auth] verification email dispatch failed', {
      userId: user._id.toString(),
      email: user.email,
      error: error.message
    });
  }

  try {
    await notifyUser({
      user,
      type: 'SECURITY',
      subType: 'EMAIL_VERIFICATION_REQUIRED',
      title: 'Verify your email',
      message: 'Please verify your email address to secure your account.',
      linkUrl: '/verify-email',
      metadata: { reason: 'registration' },
      actor: {
        actorRole,
        action: 'security.email-verification-notification'
      }
    });
  } catch (error) {
    console.error('[auth] verification in-app notification failed', {
      userId: user._id.toString(),
      error: error.message
    });
  }
}

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, referralCode } = req.body;

    const normalizedEmail = String(email || '').toLowerCase().trim();
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      role: role || 'customer',
      isVerified: false
    });

    await logActivity({
      userId: user._id,
      role: user.role,
      action: 'REGISTER',
      entityType: 'USER',
      entityId: user._id,
      metadata: { email: user.email },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
    });

    await queueVerification(user, 'Customer');

    const normalizedReferralCode = String(referralCode || '').trim().toUpperCase();
    if (normalizedReferralCode) {
      const code = await ReferralCode.findOne({ code: normalizedReferralCode, active: true });
      if (code) {
        await ReferralEvent.create({
          code: normalizedReferralCode,
          referredUserId: user._id,
          status: 'PENDING'
        });
      }
    }

    const token = generateToken(user._id);
    res.status(201).json(safeAuthResponse(user, token, 'Account created. Check your email to verify.'));
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.isBanned || user.isActive === false) {
      return res.status(403).json({ success: false, message: 'Your account is currently restricted' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const roleNeedsTwoFactor = ['admin', 'vendor'].includes(String(user.role));
    if (roleNeedsTwoFactor && user.twoFactorEnabled) {
      const twoFactorCode = String(req.body?.twoFactorCode || '').trim();
      if (!twoFactorCode) {
        return res.status(200).json({
          success: true,
          requiresTwoFactor: true,
          message: 'Two-factor code required to complete login'
        });
      }
      const secret = decryptSecret(user.twoFactorSecretEncrypted);
      if (!secret || !verifyTotpCode(secret, twoFactorCode)) {
        return res.status(401).json({ success: false, message: 'Invalid two-factor code' });
      }
    }

    const token = generateToken(user._id);
    const message = user.role === 'admin'
      ? 'Admin credentials verified and vetted. Access granted.'
      : user.isVerified
        ? 'Logged in successfully'
        : 'Logged in successfully. Please verify your email.';

    user.lastLogin = new Date();
    await user.save();

    await logActivity({
      userId: user._id,
      role: user.role,
      action: 'LOGIN',
      entityType: 'USER',
      entityId: user._id,
      metadata: { email: user.email },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
    });

    res.status(200).json(safeAuthResponse(user, token, message));
  } catch (error) {
    next(error);
  }
};

// @desc    Setup 2FA
// @route   POST /api/auth/2fa/setup
// @access  Private (Admin/Vendor)
exports.setupTwoFactor = async (req, res, next) => {
  try {
    if (!['admin', 'vendor'].includes(String(req.user.role))) {
      return res.status(403).json({ success: false, message: '2FA setup is only available for admin and vendor accounts' });
    }

    const user = await User.findById(req.user.id);
    const secret = generateSecret();
    user.twoFactorSecretEncrypted = encryptSecret(secret);
    user.twoFactorEnabled = false;
    await user.save();

    const issuer = process.env.TWO_FACTOR_ISSUER || 'NVM Marketplace';
    const otpauthUrl = buildOtpAuthUrl({ issuer, account: user.email, secret });

    return res.status(200).json({
      success: true,
      data: {
        secret,
        otpauthUrl,
        manualEntryKey: secret
      }
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Verify/enable 2FA
// @route   POST /api/auth/2fa/verify
// @access  Private (Admin/Vendor)
exports.verifyTwoFactor = async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) return res.status(400).json({ success: false, message: 'token is required' });

    const user = await User.findById(req.user.id);
    const secret = decryptSecret(user.twoFactorSecretEncrypted);
    if (!secret) return res.status(400).json({ success: false, message: '2FA setup has not been initialized' });
    if (!verifyTotpCode(secret, token)) return res.status(400).json({ success: false, message: 'Invalid token' });

    user.twoFactorEnabled = true;
    await user.save();

    return res.status(200).json({ success: true, message: 'Two-factor authentication enabled' });
  } catch (error) {
    return next(error);
  }
};

// @desc    Disable 2FA
// @route   POST /api/auth/2fa/disable
// @access  Private (Admin/Vendor)
exports.disableTwoFactor = async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    const user = await User.findById(req.user.id);

    if (!user.twoFactorEnabled) {
      return res.status(400).json({ success: false, message: '2FA is not enabled' });
    }

    const secret = decryptSecret(user.twoFactorSecretEncrypted);
    if (!secret || !verifyTotpCode(secret, token)) {
      return res.status(400).json({ success: false, message: 'Invalid token' });
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecretEncrypted = '';
    await user.save();

    return res.status(200).json({ success: true, message: 'Two-factor authentication disabled' });
  } catch (error) {
    return next(error);
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify email
// @route   POST /api/auth/verify-email
// @access  Public
exports.verifyEmail = async (req, res, next) => {
  try {
    const rawToken = req.body?.token || req.query?.token || req.params?.token;
    if (!rawToken) {
      return res.status(400).json({ success: false, message: 'Verification token is required' });
    }

    const verificationToken = hashToken(rawToken);

    const user = await User.findOne({
      verificationToken,
      verificationTokenExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpire = undefined;
    await user.save();

    await notifyUser({
      user,
      type: 'SECURITY',
      subType: 'EMAIL_VERIFIED',
      title: 'Email verified',
      message: 'Your email address has been verified successfully.',
      linkUrl: '/customer/dashboard',
      metadata: { event: 'email.verified' },
      actor: {
        actorId: user._id,
        actorRole: user.role === 'vendor' ? 'Vendor' : 'Customer',
        action: 'security.email-verified'
      }
    });

    await safeSendTemplateEmail({
      to: user.email,
      templateId: 'welcome_email',
      context: {
        userName: user.name,
        actionUrl: buildAppUrl('/marketplace')
      },
      metadata: {
        event: 'email.welcome',
        userId: user._id.toString()
      }
    });

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      redirectUrl: buildAppUrl('/login')
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Resend email verification
// @route   POST /api/auth/resend-verification
// @access  Public
exports.resendVerification = async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();

    if (!email) {
      return res.status(200).json({
        success: true,
        message: 'If that email exists, a verification email has been sent.'
      });
    }

    const user = await User.findOne({ email });
    if (user && !user.isVerified) {
      await queueVerification(user, 'System', 'resend_verification');
    }

    res.status(200).json({
      success: true,
      message: 'If that email exists, a verification email has been sent.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!email) {
      return res.status(200).json({
        success: true,
        message: GENERIC_FORGOT_PASSWORD_MESSAGE
      });
    }

    const user = await User.findOne({ email }).select('name email role resetPasswordTokenHash resetPasswordTokenExpiresAt');

    if (user) {
      const resetToken = generateRawResetToken();
      const resetTokenHash = hashToken(resetToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

      user.resetPasswordTokenHash = resetTokenHash;
      user.resetPasswordTokenExpiresAt = expiresAt;
      user.resetPasswordRequestedAt = new Date();
      user.resetPasswordUsedAt = undefined;
      // Keep legacy fields populated for backward compatibility with any older flows.
      user.resetPasswordToken = resetTokenHash;
      user.resetPasswordExpire = expiresAt;
      await user.save();

      const resetUrl = buildResetPasswordLink(resetToken, user.email);

      await safeSendTemplateEmail({
        to: user.email,
        templateId: 'password_reset',
        context: {
          userName: user.name,
          actionUrl: resetUrl,
          actionLinks: [{ label: 'Reset Password', url: resetUrl }],
          resetExpiresMinutes: RESET_TOKEN_TTL_MINUTES
        },
        metadata: {
          event: 'password.reset.requested',
          userId: user._id.toString()
        }
      });

      await notifyUser({
        user,
        type: 'SECURITY',
        subType: 'PASSWORD_RESET_REQUESTED',
        title: 'Password reset requested',
        message: 'If this was not you, secure your account immediately.',
        linkUrl: '/profile',
        metadata: { event: 'password.reset.requested' },
        actor: {
          actorId: user._id,
          actorRole: user.role === 'vendor' ? 'Vendor' : user.role === 'admin' ? 'Admin' : 'Customer',
          action: 'security.password-reset-requested'
        }
      });

      await logActivity({
        userId: user._id,
        role: user.role,
        action: 'PASSWORD_RESET_REQUESTED',
        entityType: 'USER',
        entityId: user._id,
        metadata: { via: 'email_link' },
        ipAddress: resolveIp(req),
        userAgent: req.headers['user-agent'] || ''
      });

    }

    res.status(200).json({
      success: true,
      message: GENERIC_FORGOT_PASSWORD_MESSAGE
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password | PUT /api/auth/reset-password/:token
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    const email = String(req.body?.email || req.query?.email || '').toLowerCase().trim();
    const rawToken = req.params?.token || req.body?.token || req.query?.token;
    if (!email || !rawToken) {
      return resetTokenInvalidResponse(res);
    }

    const resetPasswordTokenHash = hashToken(rawToken);
    const user = await User.findOne({ email }).select('+password');
    if (!hasValidResetToken(user, resetPasswordTokenHash)) {
      return resetTokenInvalidResponse(res);
    }

    const nextPassword = req.body?.newPassword || req.body?.password;
    const confirmPassword = req.body?.confirmPassword;

    if (!nextPassword || !isStrongPassword(nextPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters and include uppercase, lowercase, and a number.'
      });
    }

    if (typeof confirmPassword !== 'undefined' && String(nextPassword) !== String(confirmPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password confirmation does not match.'
      });
    }

    user.password = nextPassword;
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordTokenExpiresAt = undefined;
    user.resetPasswordUsedAt = new Date();
    // Clear legacy fields as well.
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    await logActivity({
      userId: user._id,
      role: user.role,
      action: 'PASSWORD_RESET_COMPLETED',
      entityType: 'USER',
      entityId: user._id,
      metadata: { via: 'token' },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
    });

    await safeSendTemplateEmail({
      to: user.email,
      templateId: 'password_changed',
      context: {
        userName: user.name,
        actionUrl: buildAppUrl('/profile')
      },
      metadata: {
        event: 'password.changed',
        userId: user._id.toString()
      }
    });

    res.status(200).json({
      success: true,
      message: 'Password updated successfully.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Validate reset token
// @route   POST /api/auth/validate-reset-token
// @access  Public
exports.validateResetToken = async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    const rawToken = String(req.body?.token || '').trim();
    if (!email || !rawToken) {
      return resetTokenInvalidResponse(res);
    }

    const tokenHash = hashToken(rawToken);
    const user = await User.findOne({ email }).select('resetPasswordTokenHash resetPasswordToken resetPasswordTokenExpiresAt resetPasswordExpire resetPasswordUsedAt');
    if (!hasValidResetToken(user, tokenHash)) {
      return resetTokenInvalidResponse(res);
    }

    return res.status(200).json({
      success: true,
      valid: true
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone, avatar } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, phone, avatar },
      { new: true, runValidators: true }
    );

    await logActivity({
      userId: user._id,
      role: user.role,
      action: 'PROFILE_UPDATED',
      entityType: 'USER',
      entityId: user._id,
      metadata: { fields: ['name', 'phone', 'avatar'].filter((field) => req.body[field] !== undefined) },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
    });

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};
