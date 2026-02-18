const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Vendor = require('../models/Vendor');

function normalizeRole(role) {
  return String(role || '').toUpperCase();
}

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided, authorization denied'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided, authorization denied'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');

    // Get user from token
    req.user = await User.findById(decoded.id).select('-password');
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (req.user.isBanned) {
      return res.status(403).json({
        success: false,
        message: 'Account is restricted'
      });
    }

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error during authentication'
    });
  }
}

function requireRole(...roles) {
  const allowed = new Set(roles.map(normalizeRole));

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userRole = normalizeRole(req.user.role);
    if (!allowed.has(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied for this role'
      });
    }

    return next();
  };
}

async function requireVendorActive(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (String(req.user.role) === 'admin') {
      return next();
    }

    if (String(req.user.role) !== 'vendor') {
      return res.status(403).json({ success: false, message: 'Vendor privileges required' });
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
      return res.status(403).json({
        success: false,
        message: vendor.suspensionReason || vendor.rejectionReason || 'Vendor account is not active'
      });
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
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (String(req.user.role) === 'admin') return next();

    const expected = String(req.params[paramName] || '');
    const actual = String(req.user[field] || req.user._id || '');

    if (!expected || !actual || expected !== actual) {
      return res.status(403).json({ success: false, message: 'Forbidden: ownership check failed' });
    }

    return next();
  };
}

function isAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }
}

function isVendor(req, res, next) {
  if (req.user && (req.user.role === 'vendor' || req.user.role === 'admin')) {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'Access denied. Vendor privileges required.'
    });
  }
}

function isCustomer(req, res, next) {
  if (req.user) {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'Access denied. Please log in.'
    });
  }
}

async function optionalAuthenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
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

  return res.status(403).json({
    success: false,
    message: 'Verify your email before performing this action'
  });
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

