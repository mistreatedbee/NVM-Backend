const ActivityLog = require('../models/ActivityLog');
const AuditLog = require('../models/AuditLog');

function resolveIp(req) {
  return req.headers['x-forwarded-for']?.split(',')?.[0]?.trim() || req.ip || '';
}

function normalizeRole(role) {
  const value = String(role || '').toLowerCase();
  if (value === 'admin') return 'ADMIN';
  if (value === 'vendor') return 'VENDOR';
  return 'CUSTOMER';
}

async function logActivity({ userId, role, action, entityType, entityId, metadata, ipAddress, userAgent }) {
  if (!userId || !action) return null;
  return ActivityLog.create({
    userId,
    role: normalizeRole(role),
    action,
    entityType: entityType || 'SYSTEM',
    entityId: entityId || null,
    metadata: metadata || {},
    ipAddress: ipAddress || '',
    userAgent: userAgent || ''
  });
}

async function logAudit({ actorAdminId, actionType, targetType, targetId, reason, metadata, ipAddress, userAgent }) {
  if (!actorAdminId || !actionType || !targetType) return null;

  const payload = {
    actorAdminId,
    actorId: actorAdminId,
    actorRole: 'Admin',
    actionType,
    action: actionType,
    targetType,
    targetId: targetId || null,
    reason: reason || '',
    metadata: metadata || {},
    ipAddress: ipAddress || '',
    userAgent: userAgent || '',
    entityType: targetType === 'DOCUMENT' ? 'Document' : targetType.charAt(0) + targetType.slice(1).toLowerCase(),
    entityId: targetId || null
  };

  if (targetType === 'VENDOR') payload.targetVendorId = targetId;
  if (targetType === 'PRODUCT') payload.targetProductId = targetId;

  const audit = await AuditLog.create(payload);

  await logActivity({
    userId: actorAdminId,
    role: 'ADMIN',
    action: 'ADMIN_ACTION',
    entityType: targetType,
    entityId: targetId || null,
    metadata: {
      actionType,
      reason: reason || '',
      ...((metadata && typeof metadata === 'object') ? metadata : {})
    },
    ipAddress,
    userAgent
  });

  return audit;
}

module.exports = {
  resolveIp,
  logActivity,
  logAudit
};
