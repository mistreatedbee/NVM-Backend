const Vendor = require('../models/Vendor');

const DEBUG_AUTH_ENABLED = process.env.NODE_ENV !== 'production' || String(process.env.DEBUG_AUTH || '').toLowerCase() === 'true';

function authDebug(event, payload = {}) {
  if (!DEBUG_AUTH_ENABLED) return;
  console.log(`[auth:${event}]`, payload);
}

function normalizeRole(role) {
  return String(role || '').toUpperCase();
}

function normalizeVendorStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeLegacyStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function getVendorAccessState(vendor) {
  const vendorStatus = normalizeVendorStatus(vendor?.vendorStatus);
  const legacyStatus = normalizeLegacyStatus(vendor?.status);
  const legacyAccountStatus = normalizeLegacyStatus(vendor?.accountStatus);

  const activeByVendorStatus = vendorStatus === 'ACTIVE';
  const activeByLegacyStatus = legacyStatus === 'approved' && legacyAccountStatus === 'active';

  // Handle stale/migrated records where vendorStatus remained PENDING but legacy flags are active.
  const isActive = activeByVendorStatus || (!vendorStatus && activeByLegacyStatus) || (vendorStatus === 'PENDING' && activeByLegacyStatus);

  return {
    isActive,
    vendorStatus,
    legacyStatus,
    legacyAccountStatus
  };
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
      authDebug('require-active-vendor.forbidden-role', {
        path: req.originalUrl,
        method: req.method,
        userId: req.user?.id || null,
        role
      });
      return res.status(403).json({
        success: false,
        message: 'Forbidden',
        detail: 'Role vendor required'
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

    const state = getVendorAccessState(vendor);
    if (!state.isActive) {
      const reason = vendor.suspensionReason || vendor.rejectionReason || 'Vendor account is not active';
      authDebug('require-active-vendor.inactive', {
        path: req.originalUrl,
        method: req.method,
        userId: req.user.id,
        role,
        vendorStatus: state.vendorStatus || null,
        status: state.legacyStatus || null,
        accountStatus: state.legacyAccountStatus || null,
        reason
      });

      return res.status(403).json({
        success: false,
        message: 'Forbidden',
        detail: `Vendor account is restricted: ${reason}`,
        data: {
          vendorStatus: state.vendorStatus || null,
          status: state.legacyStatus || null,
          accountStatus: state.legacyAccountStatus || null
        }
      });
    }

    authDebug('require-active-vendor.allowed', {
      path: req.originalUrl,
      method: req.method,
      userId: req.user.id,
      role,
      vendorStatus: state.vendorStatus || null,
      status: state.legacyStatus || null,
      accountStatus: state.legacyAccountStatus || null
    });

    req.vendor = vendor;
    return next();
  } catch (error) {
    return next(error);
  }
};
