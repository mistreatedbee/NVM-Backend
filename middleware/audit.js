import AuditLog from '../models/AuditLog.js';

export const createAuditLog = async (req, action, entity, entityId, changes = null) => {
  try {
    if (!req.user) return; // Skip if no user (public routes)

    await AuditLog.create({
      action,
      entity,
      entityId,
      user: req.user._id,
      changes,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      metadata: {
        method: req.method,
        path: req.path,
        body: req.method !== 'GET' ? req.body : undefined
      }
    });
  } catch (error) {
    console.error('Error creating audit log:', error);
    // Don't throw - audit logging shouldn't break the app
  }
};

export const auditMiddleware = (action, entity) => {
  return async (req, res, next) => {
    // Log after the action completes
    const originalSend = res.json;
    res.json = function(data) {
      if (res.statusCode < 400) {
        const entityId = req.params.id || data?.data?._id || data?.data?.id;
        createAuditLog(req, action, entity, entityId, req.body);
      }
      return originalSend.call(this, data);
    };
    next();
  };
};

