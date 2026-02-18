const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const trustedOrigins = new Set(
  [
    'http://localhost:5173',
    'http://localhost:3000',
    process.env.FRONTEND_URL
  ].filter(Boolean)
);

function isTrustedOrigin(origin) {
  if (!origin) return true;
  if (trustedOrigins.has(origin)) return true;
  return origin.includes('vercel.app') || origin.includes('localhost');
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many auth attempts, please try again later.' }
});

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Search rate limit exceeded.' }
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Upload rate limit exceeded.' }
});

const sensitiveWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Sensitive action rate limit exceeded.' }
});

function requireTrustedOrigin(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  const origin = req.get('origin');
  if (isTrustedOrigin(origin)) return next();

  return res.status(403).json({
    success: false,
    message: 'Origin is not allowed for this operation'
  });
}

module.exports = {
  securityHeaders: helmet(),
  apiLimiter,
  authLimiter,
  searchLimiter,
  uploadLimiter,
  sensitiveWriteLimiter,
  requireTrustedOrigin
};
