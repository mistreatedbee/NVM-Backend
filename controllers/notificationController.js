const Notification = require('../models/Notification');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { createManyNotifications } = require('../services/notificationService');

function normalizeType(type) {
  const value = String(type || '').toUpperCase();
  if (value === 'ORDER') return 'ORDER';
  if (value === 'VENDOR_APPROVAL' || value === 'APPROVAL') return 'VENDOR_APPROVAL';
  if (value === 'ACCOUNT_STATUS' || value === 'ACCOUNT' || value === 'SECURITY') return 'ACCOUNT_STATUS';
  return 'SYSTEM';
}

function normalizeRoles(roles = []) {
  const roleMap = {
    CUSTOMER: 'customer',
    VENDOR: 'vendor',
    ADMIN: 'admin'
  };
  const normalized = (Array.isArray(roles) ? roles : [])
    .map((role) => String(role || '').toUpperCase())
    .filter((role) => roleMap[role])
    .map((role) => roleMap[role]);
  return [...new Set(normalized)];
}

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const query = { userId: req.user.id };
    if (req.query.unreadOnly === 'true' || req.query.isRead === 'false') query.isRead = false;
    if (req.query.unreadOnly === 'false' || req.query.isRead === 'true') query.isRead = true;
    if (req.query.type) query.type = normalizeType(req.query.type);

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Notification.countDocuments(query),
      Notification.countDocuments({ userId: req.user.id, isRead: false })
    ]);

    res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      unreadCount,
      data: notifications
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get unread count
// @route   GET /api/notifications/unread-count
// @access  Private
exports.getUnreadCount = async (req, res, next) => {
  try {
    const unreadCount = await Notification.countDocuments({
      userId: req.user.id,
      isRead: false
    });

    res.status(200).json({ success: true, unreadCount });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
exports.markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark all as read
// @route   PATCH /api/notifications/read-all
// @access  Private
exports.markAllAsRead = async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user.id, isRead: false },
      { isRead: true }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete one notification
// @route   DELETE /api/notifications/:id
// @access  Private
exports.deleteNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
};

// @desc    Broadcast system notification
// @route   POST /api/admin/notifications/broadcast
// @access  Private/Admin
exports.broadcastNotification = async (req, res, next) => {
  try {
    const {
      roles,
      title,
      message,
      linkUrl,
      type = 'SYSTEM',
      subType = 'SYSTEM_BROADCAST',
      metadata = {}
    } = req.body || {};

    if (!Array.isArray(roles) || !roles.length) {
      return res.status(400).json({ success: false, message: 'roles is required (array)' });
    }
    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'title and message are required' });
    }

    const targetRoles = normalizeRoles(roles);
    if (!targetRoles.length) {
      return res.status(400).json({ success: false, message: 'No valid roles provided' });
    }

    const users = await User.find({
      role: { $in: targetRoles },
      isActive: true,
      isBanned: false
    }).select('_id role');

    if (!users.length) {
      return res.status(200).json({
        success: true,
        message: 'No matching active users found',
        insertedCount: 0
      });
    }

    const notifications = users.map((user) => ({
      userId: user._id,
      role: user.role,
      type,
      subType,
      title,
      message,
      linkUrl,
      metadata: {
        ...metadata,
        broadcastByAdminId: req.user.id,
        roles: targetRoles
      }
    }));

    const inserted = await createManyNotifications(notifications);

    const normalizedType = normalizeType(type);

    await AuditLog.create({
      actorAdminId: req.user.id,
      actorId: req.user.id,
      actorRole: 'Admin',
      actionType: 'NOTIFICATION_BROADCAST',
      action: 'NOTIFICATION_BROADCAST',
      entityType: 'System',
      metadata: {
        targetRoles,
        title,
        linkUrl: linkUrl || null,
        type: normalizedType,
        subType,
        insertedCount: inserted.length
      }
    });

    if (normalizedType === 'SYSTEM') {
      await AuditLog.create({
        actorAdminId: req.user.id,
        actorId: req.user.id,
        actorRole: 'Admin',
        actionType: 'ADMIN_ALERT_CREATED',
        action: 'ADMIN_ALERT_CREATED',
        entityType: 'System',
        metadata: {
          targetRoles,
          title,
          subType,
          insertedCount: inserted.length
        }
      });
    }

    return res.status(201).json({
      success: true,
      insertedCount: inserted.length,
      message: 'Broadcast notifications created'
    });
  } catch (error) {
    return next(error);
  }
};
