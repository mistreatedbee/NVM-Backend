const Vendor = require('../models/Vendor');

function isVendorActive(vendor) {
  if (!vendor) return false;

  if (vendor.vendorStatus) {
    return vendor.vendorStatus === 'ACTIVE';
  }

  return vendor.status === 'approved' && vendor.accountStatus === 'active';
}

function normalizeRole(role) {
  return String(role || '').toUpperCase();
}

exports.requireActiveVendorAccount = async (req, res, next) => {
  try {
    const role = normalizeRole(req.user?.role);
    if (!req.user || role === 'ADMIN') {
      return next();
    }

    if (role !== 'VENDOR') {
      return res.status(403).json({
        success: false,
        message: 'Vendor privileges required'
      });
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

    if (!isVendorActive(vendor)) {
      const reason = vendor.suspensionReason || vendor.rejectionReason || 'Vendor account is not active';
      return res.status(403).json({
        success: false,
        message: `Vendor account is restricted: ${reason}`,
        data: {
          vendorStatus: vendor.vendorStatus || null,
          status: vendor.status,
          accountStatus: vendor.accountStatus
        }
      });
    }

    req.vendor = vendor;
    return next();
  } catch (error) {
    return next(error);
  }
};
