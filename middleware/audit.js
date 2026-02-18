const AuditLog = require('../models/AuditLog');

async function createAuditLog(req, action, entityType, entityId, metadata = {}) {
  try {
    if (!req.user) return;
    await AuditLog.create({
      actorId: req.user._id,
      actorRole: req.user.role === 'admin' ? 'Admin' : req.user.role === 'vendor' ? 'Vendor' : 'Customer',
      action,
      entityType: entityType || 'System',
      entityId: entityId || null,
      metadata,
      ipAddress: req.ip || '',
      userAgent: req.get('user-agent') || ''
    });
  } catch (error) {
    console.error('createAuditLog failed:', error.message);
  }
}

function auditMiddleware(action, entityType) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 400) {
        const entityId = req.params.id || body?.data?._id || body?.data?.id || null;
        createAuditLog(req, action, entityType, entityId, { body: req.body });
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = {
  createAuditLog,
  auditMiddleware
};
