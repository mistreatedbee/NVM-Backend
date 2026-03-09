const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Vendor = require('../models/Vendor');

const DEBUG_AUTH_ENABLED = process.env.NODE_ENV !== 'production' || String(process.env.DEBUG_AUTH || '').toLowerCase() === 'true';

function authDebug(event, payload = {}) {
  if (!DEBUG_AUTH_ENABLED) return;
  console.log(`[auth:${event}]`, payload);
}

function normalizeRole(role) {
  return String(role || '').toUpperCase();
}

function hasRole(user, ...roles) {
  const current = normalizeRole(user?.role);
  return roles.map(normalizeRole).includes(current);
}

function sendAuthError(res, statusCode, detail) {
  const message = statusCode === 401 ? 'Unauthorized' : 'Forbidden';
  return res.status(statusCode).json({
    success: false,
    message,
    detail
  });
}

function parseCookies(req) {
  const cookieHeader = String(req.headers.cookie || '');
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx <= 0) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) return;
    cookies[key] = decodeURIComponent(value || '');
  });

  return cookies;
}

function extractToken(req) {
  const authHeader = String(req.headers.authorization || '');
  const cookies = parseCookies(req);

  if (authHeader.startsWith('Bearer ')) {
    return {
      token: authHeader.substring(7).trim(),
      source: 'authorization',
      hasAuthorizationHeader: true,
      cookieKeys: Object.keys(cookies)
    };
  }

  const cookieToken = cookies.token || cookies.accessToken || cookies.jwt || cookies.authToken || '';
  if (cookieToken) {
    return {
      token: String(cookieToken).trim(),
      source: 'cookie',
      hasAuthorizationHeader: Boolean(authHeader),
      cookieKeys: Object.keys(cookies)
    };
  }

  return {
    token: '',
    source: 'none',
    hasAuthorizationHeader: Boolean(authHeader),
    cookieKeys: Object.keys(cookies)
  };
}

async function authenticate(req, res, next) {
  try {
    const { token, source, hasAuthorizationHeader, cookieKeys } = extractToken(req);
    if (!token) {
      authDebug('authenticate.missing-token', {
        path: req.originalUrl,
        method: req.method,
        hasAuthorizationHeader,
        cookieKeys
      });
      return sendAuthError(res, 401, 'Missing token');
    }

    if (!process.env.JWT_SECRET) {
      authDebug('authenticate.misconfigured-secret', { path: req.originalUrl, method: req.method });
      return res.status(500).json({
        success: false,
        message: 'Server error',
        detail: 'JWT secret not configured'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      authDebug('authenticate.user-not-found', { userId: decoded.id, path: req.originalUrl });
      return sendAuthError(res, 401, 'User not found');
    }

    if (req.user.isBanned) {
      authDebug('authenticate.account-banned', {
        userId: req.user.id,
        role: req.user.role,
        path: req.originalUrl
      });
      return sendAuthError(res, 403, 'Account is restricted');
    }

    authDebug('authenticate.success', {
      path: req.originalUrl,
      method: req.method,
      tokenSource: source,
      hasAuthorizationHeader,
      cookieKeys,
      user: {
        id: req.user.id,
        role: req.user.role
      }
    });

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      authDebug('authenticate.invalid-token', { path: req.originalUrl, method: req.method });
      return sendAuthError(res, 401, 'Invalid token');
    }
    if (error.name === 'TokenExpiredError') {
      authDebug('authenticate.expired-token', { path: req.originalUrl, method: req.method });
      return sendAuthError(res, 401, 'Token expired');
    }
    authDebug('authenticate.error', { path: req.originalUrl, method: req.method, error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error during authentication',
      detail: error.message
    });
  }
}

function requireRole(...roles) {
  const allowed = new Set(roles.map(normalizeRole));

  return (req, res, next) => {
    if (!req.user) {
      return sendAuthError(res, 401, 'Authentication required');
    }

    const userRole = normalizeRole(req.user.role);
    if (!allowed.has(userRole)) {
      authDebug('require-role.forbidden', {
        path: req.originalUrl,
        role: userRole,
        allowed: [...allowed]
      });
      return sendAuthError(res, 403, `Role ${[...allowed].join(', ')} required`);
    }

    return next();
  };
}

async function requireVendorActive(req, res, next) {
  try {
    if (!req.user) {
      return sendAuthError(res, 401, 'Authentication required');
    }

    if (hasRole(req.user, 'admin')) {
      return next();
    }

    if (!hasRole(req.user, 'vendor')) {
      return sendAuthError(res, 403, 'Role vendor required');
    }

    const vendor = await Vendor.findOne({ user: req.user.id }).select(
      'vendorStatus status accountStatus suspensionReason rejectionReason'
    );

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }

    const isActive = vendor.vendorStatus
      ? vendor.vendorStatus === 'ACTIVE'
      : vendor.status === 'approved' && vendor.accountStatus === 'active';

    if (!isActive) {
      return sendAuthError(res, 403, vendor.suspensionReason || vendor.rejectionReason || 'Vendor account is not active');
    }

    req.vendor = vendor;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireOwner(paramName = 'id', field = '_id') {
  return (req, res, next) => {
    if (!req.user) {
      return sendAuthError(res, 401, 'Authentication required');
    }

    if (hasRole(req.user, 'admin')) return next();

    const expected = String(req.params[paramName] || '');
    const actual = String(req.user[field] || req.user._id || '');

    if (!expected || !actual || expected !== actual) {
      return sendAuthError(res, 403, 'Ownership check failed');
    }

    return next();
  };
}

function isAdmin(req, res, next) {
  if (hasRole(req.user, 'admin')) {
    next();
  } else {
    return sendAuthError(res, 403, 'Role admin required');
  }
}

function isVendor(req, res, next) {
  if (hasRole(req.user, 'vendor', 'admin')) {
    next();
  } else {
    return sendAuthError(res, 403, 'Role vendor required');
  }
}

function isCustomer(req, res, next) {
  if (req.user) {
    next();
  } else {
    return sendAuthError(res, 401, 'Authentication required');
  }
}

async function optionalAuthenticate(req, res, next) {
  try {
    const { token } = extractToken(req);
    if (!token) {
      return next();
    }

    if (!process.env.JWT_SECRET) return next();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (user && !user.isBanned) {
      req.user = user;
    }

    return next();
  } catch (error) {
    return next();
  }
}

function requireVerifiedEmail(req, res, next) {
  if (req.user?.isVerified) {
    return next();
  }

  return sendAuthError(res, 403, 'Verify your email before performing this action');
}

module.exports = {
  authenticate,
  requireAuth: authenticate,
  optionalAuthenticate,
  requireRole,
  requireVendorActive,
  requireOwner,
  isAdmin,
  isVendor,
  isCustomer,
  requireVerifiedEmail
};

