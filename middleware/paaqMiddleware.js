const { track } = require('../paaq');

function paaqMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    track('api_request', {
      method: req.method,
      path: req.route?.path || req.path,
      status: res.statusCode,
      duration_ms: duration,
      user_id: req.user?.id || null,
      user_role: req.user?.role || null,
    });
  });
  next();
}

function paaqErrorMiddleware(err, req, res, next) {
  track('api_error', {
    method: req.method,
    path: req.route?.path || req.path,
    error: err.message,
    status: err.status || 500,
    user_id: req.user?.id || null,
  });
  next(err);
}

module.exports = { paaqMiddleware, paaqErrorMiddleware };
