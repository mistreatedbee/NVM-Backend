const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const router = express.Router();
const {
  register,
  login,
  getMe,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  validateResetToken,
  updateProfile,
  setupTwoFactor,
  verifyTwoFactor,
  disableTwoFactor
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');

const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many verification requests. Try again later.' }
});

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

const forgotPasswordGenericResponse = {
  success: true,
  message: 'If an account exists for that email, we sent a reset link.'
};

const forgotPasswordIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(200).json(forgotPasswordGenericResponse)
});

const forgotPasswordEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = normalizeEmail(req.body?.email);
    return email ? `forgot:email:${email}` : `forgot:ip:${req.ip}`;
  },
  handler: (_req, res) => res.status(200).json(forgotPasswordGenericResponse)
});

const resetPasswordIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many reset attempts. Try again later.' }
});

const resetPasswordCredentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = normalizeEmail(req.body?.email || req.query?.email);
    const rawToken = String(req.body?.token || req.params?.token || req.query?.token || '').trim();
    const tokenDigest = rawToken ? crypto.createHash('sha256').update(rawToken).digest('hex').slice(0, 20) : 'none';
    return `reset:${req.ip}:${email || 'no-email'}:${tokenDigest}`;
  },
  message: { success: false, message: 'Too many reset attempts. Try again later.' }
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', authenticate, getMe);
router.post('/verify-email', verifyEmail);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerificationLimiter, resendVerification);
router.post('/forgot-password', forgotPasswordIpLimiter, forgotPasswordEmailLimiter, forgotPassword);
router.post('/validate-reset-token', resetPasswordIpLimiter, resetPasswordCredentialLimiter, validateResetToken);
router.post('/reset-password', resetPasswordIpLimiter, resetPasswordCredentialLimiter, resetPassword);
router.put('/reset-password/:token', resetPasswordIpLimiter, resetPasswordCredentialLimiter, resetPassword);
router.put('/profile', authenticate, updateProfile);
router.post('/2fa/setup', authenticate, setupTwoFactor);
router.post('/2fa/verify', authenticate, verifyTwoFactor);
router.post('/2fa/disable', authenticate, disableTwoFactor);

module.exports = router;

