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

function toSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Create minimal vendor for user with vendor role but no Vendor document (so products/orders routes work even when called before getMyProfile). */
async function ensureVendorForUser(user) {
  let vendor = await Vendor.findOne({ user: user.id }).select(
    'vendorStatus status accountStatus suspensionReason rejectionReason'
  );
  if (vendor) return vendor;
  const slug = toSlug(user.name || user.email || user.id) + '-' + Date.now().toString(36);
  vendor = await Vendor.create({
    user: user.id,
    storeName: 'My Store',
    storeSlug: slug,
    slug,
    usernameSlug: slug,
    description: 'Complete your store profile.',
    category: 'other',
    email: user.email || '',
    phone: user.phone || '0000000000',
    address: {
      street: 'To be completed',
      city: 'To be completed',
      state: 'To be completed',
      country: 'To be completed',
      zipCode: 'To be completed'
    },
    status: 'approved',
    accountStatus: 'active',
    vendorStatus: 'ACTIVE',
    isActive: true
  });
  return Vendor.findOne({ user: user.id }).select(
    'vendorStatus status accountStatus suspensionReason rejectionReason'
  );
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

    let vendor = await Vendor.findOne({ user: req.user.id }).select(
      'vendorStatus status accountStatus suspensionReason rejectionReason'
    );

    if (!vendor) {
      vendor = await ensureVendorForUser(req.user);
    }

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
