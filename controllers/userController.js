const User = require('../models/User');
const Vendor = require('../models/Vendor');
const { notifyUser } = require('../services/notificationService');
const { buildAppUrl } = require('../utils/appUrl');
const { logActivity, logAudit, resolveIp } = require('../services/loggingService');

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
exports.getAll = async (req, res, next) => {
  try {
    const users = await User.find().select('-password');
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
exports.getById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // If user is a vendor, fetch vendor details
    let vendorDetails = null;
    if (user.role === 'vendor') {
      vendorDetails = await Vendor.findOne({ user: user._id });
    }

    res.status(200).json({ 
      success: true, 
      data: {
        ...user.toObject(),
        vendorDetails
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Ban user
// @route   PUT /api/users/:id/ban
// @access  Private/Admin
exports.ban = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: true, isActive: false },
      { new: true }
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await notifyUser({
      user,
      type: 'ACCOUNT',
      subType: 'ACCOUNT_BANNED',
      title: 'Account banned',
      message: 'Your account has been banned by an administrator.',
      linkUrl: '/login',
      metadata: { event: 'account.banned' },
      emailTemplate: 'account_banned',
      emailContext: {
        status: 'banned',
        reason: req.body?.reason || 'Administrative action',
        actionUrl: buildAppUrl('/support')
      },
      actor: {
        actorId: req.user.id,
        actorRole: 'Admin',
        action: 'user.banned',
        entityType: 'User'
      }
    });

    await logAudit({
      actorAdminId: req.user.id,
      actionType: 'USER_BAN',
      targetType: 'USER',
      targetId: user._id,
      reason: req.body?.reason || '',
      metadata: { userId: user._id.toString(), previous: { isBanned: false, isActive: true }, next: { isBanned: true, isActive: false } },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
    });

    res.status(200).json({ success: true, message: 'User banned successfully', data: user });
  } catch (error) {
    next(error);
  }
};

// @desc    Unban user
// @route   PUT /api/users/:id/unban
// @access  Private/Admin
exports.unban = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: false, isActive: true },
      { new: true }
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await notifyUser({
      user,
      type: 'ACCOUNT',
      subType: 'ACCOUNT_UNBANNED',
      title: 'Account restored',
      message: 'Your account access has been restored.',
      linkUrl: '/login',
      metadata: { event: 'account.unbanned' },
      emailTemplate: 'account_unbanned',
      emailContext: { status: 'active', actionUrl: buildAppUrl('/login') },
      actor: {
        actorId: req.user.id,
        actorRole: 'Admin',
        action: 'user.unbanned',
        entityType: 'User'
      }
    });

    await logAudit({
      actorAdminId: req.user.id,
      actionType: 'USER_UNBAN',
      targetType: 'USER',
      targetId: user._id,
      metadata: { userId: user._id.toString(), previous: { isBanned: true, isActive: false }, next: { isBanned: false, isActive: true } },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
    });

    res.status(200).json({ success: true, message: 'User unbanned successfully', data: user });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent deleting admin users
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot delete admin users' });
    }

    // If user is a vendor, delete vendor profile too
    if (user.role === 'vendor') {
      await Vendor.deleteOne({ user: user._id });
    }

    await user.deleteOne();
    res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile (for authenticated user)
// @route   PUT /api/users/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, email, phone, addresses } = req.body;
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already in use' });
      }
      user.email = email;
    }

    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (addresses) user.addresses = addresses;

    await user.save();

    await logActivity({
      userId: user._id,
      role: user.role,
      action: 'PROFILE_UPDATED',
      entityType: 'USER',
      entityId: user._id,
      metadata: { fields: ['name', 'phone', 'addresses'].filter((field) => req.body[field] !== undefined) },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
    });

    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        addresses: user.addresses
      }
    });
  } catch (error) {
    next(error);
  }
};
