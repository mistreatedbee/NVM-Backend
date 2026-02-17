const Notification = require('../models/Notification');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { sendTemplate } = require('./emailService');
const { getIO } = require('../socket');

function toAuditRole(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'vendor') return 'Vendor';
  if (role === 'customer') return 'Customer';
  return 'System';
}

function normalizeRole(role) {
  const value = String(role || '').toUpperCase();
  if (value === 'ADMIN') return 'ADMIN';
  if (value === 'VENDOR') return 'VENDOR';
  return 'CUSTOMER';
}

function normalizeType(type) {
  const value = String(type || '').toUpperCase();
  if (value === 'ORDER') return 'ORDER';
  if (value === 'VENDOR_APPROVAL' || value === 'APPROVAL') return 'VENDOR_APPROVAL';
  if (value === 'ACCOUNT_STATUS' || value === 'ACCOUNT' || value === 'SECURITY') return 'ACCOUNT_STATUS';
  return 'SYSTEM';
}

function inferSubType(subType, metadata = {}, fallbackType = 'SYSTEM') {
  if (subType && String(subType).trim()) {
    return String(subType).trim().toUpperCase();
  }

  const eventHint = metadata?.subType || metadata?.event || metadata?.action;
  if (eventHint) {
    return String(eventHint)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  if (fallbackType === 'ORDER') return 'ORDER_STATUS_UPDATED';
  if (fallbackType === 'VENDOR_APPROVAL') return 'VENDOR_STATUS_UPDATE';
  if (fallbackType === 'ACCOUNT_STATUS') return 'ACCOUNT_STATUS_UPDATE';
  return 'SYSTEM_ALERT';
}

async function emitRealtimeNotification(notification) {
  try {
    const io = getIO();
    io.to(`user:${String(notification.userId)}`).emit('notifications:new', notification);
  } catch (_error) {
    // Socket server can be unavailable in tests or non-realtime workers.
  }
}

function isEmailAvailable() {
  const hasBrevoApi = Boolean(process.env.BREVO_API_KEY);
  const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  return hasBrevoApi || hasSmtp;
}

async function safeSendTemplateEmail({ to, templateId, context, metadata }) {
  if (!to) return { skipped: true, reason: 'missing-email' };
  if (!isEmailAvailable()) return { skipped: true, reason: 'email-not-configured' };

  try {
    return await sendTemplate(templateId, to, context, metadata);
  } catch (error) {
    console.error('[notification] email send failed', {
      to,
      templateId,
      error: error.message
    });
    return { skipped: true, reason: 'send-failed', error: error.message };
  }
}

async function createNotification({
  userId,
  role,
  type,
  subType,
  title,
  message,
  linkUrl,
  metadata
}) {
  const normalizedType = normalizeType(type);
  const notification = await Notification.create({
    userId,
    role: normalizeRole(role),
    type: normalizedType,
    subType: inferSubType(subType, metadata, normalizedType),
    title,
    message,
    linkUrl,
    metadata
  });

  await emitRealtimeNotification(notification);
  return notification;
}

async function createManyNotifications(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const documents = items.map((item) => {
    const normalizedType = normalizeType(item.type);
    return {
      userId: item.userId,
      role: normalizeRole(item.role),
      type: normalizedType,
      subType: inferSubType(item.subType, item.metadata, normalizedType),
      title: item.title,
      message: item.message,
      linkUrl: item.linkUrl,
      metadata: item.metadata
    };
  });

  const inserted = await Notification.insertMany(documents, { ordered: false });
  for (const notification of inserted) {
    await emitRealtimeNotification(notification);
  }
  return inserted;
}

async function notifyUserAndEmail(userId, templateName, variables = {}, notificationPayload = {}) {
  const user = await User.findById(userId).select('name email role');
  if (!user) return null;

  const notification = await createNotification({
    userId: user._id,
    role: user.role,
    ...notificationPayload
  });

  if (templateName) {
    await safeSendTemplateEmail({
      to: user.email,
      templateId: templateName,
      context: {
        userName: user.name,
        ...variables
      },
      metadata: notificationPayload.metadata || {}
    });
  }

  return notification;
}

async function notifyUser({
  user,
  type,
  subType,
  title,
  message,
  linkUrl,
  metadata,
  emailTemplate,
  emailContext,
  actor
}) {
  if (!user?._id) return null;

  const notification = await createNotification({
    userId: user._id,
    role: user.role,
    type,
    subType,
    title,
    message,
    linkUrl,
    metadata
  });

  if (emailTemplate) {
    await safeSendTemplateEmail({
      to: user.email,
      templateId: emailTemplate,
      context: {
        userName: user.name,
        ...emailContext
      },
      metadata
    });
  }

  if (actor?.action) {
    await AuditLog.create({
      actorId: actor.actorId || null,
      actorRole: actor.actorRole || 'System',
      action: actor.action,
      entityType: actor.entityType || 'Notification',
      entityId: notification._id,
      metadata: {
        userId: user._id,
        type: normalizeType(type),
        subType: notification.subType,
        ...metadata
      }
    });
  }

  return notification;
}

async function notifyAdmins({
  type,
  subType,
  title,
  message,
  linkUrl,
  metadata,
  emailTemplate,
  emailContext
}) {
  const admins = await User.find({ role: 'admin', isActive: true, isBanned: false }).select('name email role');
  if (!admins.length) return [];

  const notifications = [];
  for (const admin of admins) {
    const notification = await notifyUser({
      user: admin,
      type: type || 'SYSTEM',
      subType,
      title,
      message,
      linkUrl,
      metadata,
      emailTemplate,
      emailContext,
      actor: {
        actorRole: 'System',
        action: 'admin.notification.created'
      }
    });
    notifications.push(notification);
  }
  return notifications;
}

async function markAllRead(userId) {
  await Notification.updateMany({ userId, isRead: false }, { isRead: true });
}

module.exports = {
  notifyUser,
  notifyAdmins,
  createNotification,
  createManyNotifications,
  notifyUserAndEmail,
  safeSendTemplateEmail,
  markAllRead,
  toAuditRole
};
