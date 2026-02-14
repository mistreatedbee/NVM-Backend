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

function normalizeType(type) {
  const value = String(type || '').toUpperCase();
  const allowed = new Set(['ORDER', 'APPROVAL', 'ACCOUNT', 'CHAT_ESCALATION', 'SYSTEM', 'PAYOUT', 'REVIEW', 'SECURITY']);
  if (allowed.has(value)) return value;

  if (value.includes('ORDER')) return 'ORDER';
  if (value.includes('APPROVAL') || value.includes('VENDOR')) return 'APPROVAL';
  if (value.includes('ACCOUNT')) return 'ACCOUNT';
  if (value.includes('CHAT') || value.includes('ESCALAT')) return 'CHAT_ESCALATION';
  if (value.includes('PAYOUT')) return 'PAYOUT';
  if (value.includes('REVIEW')) return 'REVIEW';
  if (value.includes('SECUR')) return 'SECURITY';
  return 'SYSTEM';
}

async function emitRealtimeNotification(notification) {
  try {
    const io = getIO();
    io.to(`user:${String(notification.userId)}`).emit('notifications:new', notification);
  } catch (_error) {
    // Socket server may be unavailable in tests or offline workers.
  }
}

async function createInAppNotification({
  userId,
  role,
  type,
  title,
  message,
  linkUrl,
  metadata
}) {
  const notification = await Notification.create({
    userId,
    role: role || 'customer',
    type: normalizeType(type),
    title,
    message,
    linkUrl,
    metadata
  });

  await emitRealtimeNotification(notification);
  return notification;
}

async function safeSendTemplateEmail({ to, templateId, context, metadata }) {
  if (!to) return { skipped: true, reason: 'missing-email' };

  try {
    return await sendTemplate(templateId, to, context, metadata);
  } catch (error) {
    console.error('[notification] email send failed', {
      to,
      templateId,
      error: error.message
    });
    return { skipped: true, reason: 'send-failed' };
  }
}

async function notifyUser({
  user,
  type,
  title,
  message,
  linkUrl,
  metadata,
  emailTemplate,
  emailContext,
  actor
}) {
  if (!user?._id) {
    return null;
  }

  const notification = await createInAppNotification({
    userId: user._id,
    role: user.role,
    type,
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
        type,
        ...metadata
      }
    });
  }

  return notification;
}

async function notifyAdmins({ type, title, message, linkUrl, metadata, emailTemplate, emailContext }) {
  const admins = await User.find({ role: 'admin', isActive: true, isBanned: false }).select('name email role');

  if (!admins.length) {
    return [];
  }

  const notifications = [];
  for (const admin of admins) {
    const notification = await notifyUser({
      user: admin,
      type,
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
  createInAppNotification,
  safeSendTemplateEmail,
  markAllRead,
  toAuditRole
};
