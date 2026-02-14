const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Review = require('../models/Review');
const AuditLog = require('../models/AuditLog');
const { notifyUser, notifyAdmins } = require('../services/notificationService');
const cloudinary = require('../utils/cloudinary');

function addActivityLog(vendor, { action, message, metadata, performedBy, performedByRole }) {
  if (!Array.isArray(vendor.activityLogs)) {
    vendor.activityLogs = [];
  }

  vendor.activityLogs.unshift({
    action,
    message,
    metadata,
    performedBy,
    performedByRole
  });

  if (vendor.activityLogs.length > 200) {
    vendor.activityLogs = vendor.activityLogs.slice(0, 200);
  }
}

async function applyVendorAccountStatus(vendor, user, accountStatus, reason, actorId) {
  const now = new Date();

  vendor.accountStatus = accountStatus;
  vendor.statusUpdatedAt = now;
  vendor.statusUpdatedBy = actorId;

  if (accountStatus === 'active') {
    vendor.status = 'approved';
    vendor.isActive = true;
    vendor.approvedAt = now;
    vendor.approvedBy = actorId;
    vendor.rejectionReason = undefined;
    vendor.suspensionReason = undefined;
    vendor.suspendedAt = undefined;
    vendor.suspendedBy = undefined;
    vendor.bannedAt = undefined;
    vendor.bannedBy = undefined;
    user.isActive = true;
    user.isBanned = false;
    user.role = 'vendor';
  } else if (accountStatus === 'pending') {
    vendor.status = 'pending';
    vendor.isActive = true;
    vendor.rejectionReason = reason || undefined;
    vendor.suspensionReason = undefined;
    vendor.suspendedAt = undefined;
    vendor.suspendedBy = undefined;
    vendor.bannedAt = undefined;
    vendor.bannedBy = undefined;
    user.isActive = true;
    user.isBanned = false;
  } else if (accountStatus === 'suspended') {
    vendor.status = 'suspended';
    vendor.isActive = false;
    vendor.suspensionReason = reason || 'Suspended by admin';
    vendor.suspendedAt = now;
    vendor.suspendedBy = actorId;
    user.isActive = false;
    user.isBanned = false;
  } else if (accountStatus === 'banned') {
    vendor.status = 'suspended';
    vendor.isActive = false;
    vendor.suspensionReason = reason || 'Banned by admin';
    vendor.bannedAt = now;
    vendor.bannedBy = actorId;
    user.isActive = false;
    user.isBanned = true;
  }

  await user.save();
}

function toSlug(value = '') {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isPublicVendor(vendor) {
  const hasLegacyStatus = typeof vendor.accountStatus === 'undefined';
  return vendor &&
    vendor.status === 'approved' &&
    vendor.isActive === true &&
    (vendor.accountStatus === 'active' || hasLegacyStatus);
}

function buildVendorPublicProfile(vendor) {
  const location = vendor.location || {};
  const legacyAddress = vendor.address || {};
  const socialLinks = vendor.socialLinks || {};
  const socialMedia = vendor.socialMedia || {};

  return {
    _id: vendor._id,
    vendorId: vendor._id,
    storeName: vendor.storeName,
    businessName: vendor.storeName,
    slug: vendor.usernameSlug || vendor.slug,
    usernameSlug: vendor.usernameSlug || vendor.slug,
    profileImageUrl: vendor.profileImage?.url || vendor.logo?.url || '',
    coverImageUrl: vendor.coverImage?.url || vendor.banner?.url || '',
    profileImage: vendor.profileImage || vendor.logo || {},
    coverImage: vendor.coverImage || vendor.banner || {},
    bio: vendor.bio || vendor.description || '',
    about: vendor.about || vendor.description || '',
    category: vendor.category || '',
    businessType: vendor.businessType || '',
    phoneNumber: vendor.privacy?.showPhone === false ? null : (vendor.phone || ''),
    email: vendor.privacy?.showEmail === false ? null : (vendor.email || ''),
    website: vendor.website || socialLinks.website || '',
    location: {
      country: location.country || legacyAddress.country || '',
      state: location.state || legacyAddress.state || '',
      city: location.city || legacyAddress.city || '',
      suburb: location.suburb || '',
      addressLine: location.addressLine || legacyAddress.street || ''
    },
    socialLinks: {
      whatsapp: socialLinks.whatsapp || '',
      facebook: socialLinks.facebook || socialMedia.facebook || '',
      instagram: socialLinks.instagram || socialMedia.instagram || '',
      tiktok: socialLinks.tiktok || '',
      website: socialLinks.website || vendor.website || ''
    },
    businessHours: vendor.businessHours || '',
    policies: {
      returns: vendor.policies?.returns || vendor.settings?.returnPolicy || '',
      shipping: vendor.policies?.shipping || vendor.settings?.shippingPolicy || ''
    },
    verificationStatus: vendor.verificationStatus || 'pending',
    rating: vendor.rating || 0,
    totalReviews: vendor.totalReviews || 0,
    totalProducts: vendor.totalProducts || 0,
    createdAt: vendor.createdAt,
    updatedAt: vendor.updatedAt
  };
}

async function uploadVendorImage(buffer, folderSuffix, transformation) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    const configError = new Error('Image upload service is not configured on the server.');
    configError.statusCode = 503;
    throw configError;
  }

  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `nvm/vendors/${folderSuffix}`,
        resource_type: 'image',
        transformation
      },
      (error, uploadResult) => {
        if (error) {
          const uploadError = new Error(`Image upload failed: ${error.message || 'unknown Cloudinary error'}`);
          uploadError.statusCode = 502;
          reject(uploadError);
        }
        else resolve(uploadResult);
      }
    );
    uploadStream.end(buffer);
  });

  return {
    public_id: result.public_id,
    url: result.secure_url
  };
}

// @desc    Create vendor profile
// @route   POST /api/vendors
// @access  Private (Authenticated User)
exports.createVendor = async (req, res, next) => {
  try {
    const existingVendor = await Vendor.findOne({ user: req.user.id });
    if (existingVendor) {
      return res.status(400).json({
        success: false,
        message: 'Vendor profile already exists'
      });
    }

    const vendorData = {
      ...req.body,
      user: req.user.id,
      accountStatus: 'pending'
    };

    if (!vendorData.usernameSlug && vendorData.storeName) {
      vendorData.usernameSlug = toSlug(vendorData.storeName);
    }

    if (!vendorData.location && vendorData.address) {
      vendorData.location = {
        country: vendorData.address.country,
        state: vendorData.address.state,
        city: vendorData.address.city,
        addressLine: vendorData.address.street
      };
    }

    if (req.file) {
      try {
        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: 'nvm/vendors',
              resource_type: 'auto',
              transformation: [
                { width: 500, height: 500, crop: 'limit' },
                { quality: 'auto' },
                { fetch_format: 'auto' }
              ]
            },
            (error, uploadResult) => {
              if (error) reject(error);
              else resolve(uploadResult);
            }
          );
          uploadStream.end(req.file.buffer);
        });

        vendorData.logo = {
          public_id: result.public_id,
          url: result.secure_url
        };
      } catch (uploadError) {
        console.error('Logo upload error:', uploadError);
      }
    }

    const vendor = await Vendor.create(vendorData);

    addActivityLog(vendor, {
      action: 'vendor.created',
      message: 'Vendor registration submitted and awaiting approval',
      performedBy: req.user.id,
      performedByRole: req.user.role
    });
    await vendor.save();

    await notifyUser({
      user: req.user,
      type: 'APPROVAL',
      title: 'Vendor registration submitted',
      message: 'Your application is pending admin approval.',
      linkUrl: '/vendor/approval-status',
      metadata: { event: 'vendor.submitted', vendorId: vendor._id.toString() },
      emailTemplate: 'vendor_registration_received',
      emailContext: {
        vendorName: vendor.storeName,
        actionUrl: `${process.env.APP_BASE_URL || process.env.FRONTEND_URL || ''}/vendor/approval-status`
      },
      actor: {
        actorId: req.user.id,
        actorRole: req.user.role === 'vendor' ? 'Vendor' : 'Customer',
        action: 'vendor.registration-submitted',
        entityType: 'Vendor'
      }
    });

    await notifyAdmins({
      type: 'APPROVAL',
      title: 'New vendor awaiting approval',
      message: `${vendor.storeName} submitted registration and needs review.`,
      linkUrl: `/admin/vendors`,
      metadata: { event: 'vendor.awaiting-approval', vendorId: vendor._id.toString() },
      emailTemplate: 'system_alert',
      emailContext: {
        status: 'vendor-approval-pending',
        actionLinks: [{ label: 'Review vendor', url: `${process.env.APP_BASE_URL || process.env.FRONTEND_URL || ''}/admin/vendors` }]
      }
    });

    res.status(201).json({
      success: true,
      message: 'Vendor registration submitted successfully. Awaiting admin approval.',
      data: vendor
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get vendor profile
// @route   GET /api/vendors/:id
// @access  Public
exports.getVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id)
      .populate('user', 'name avatar');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const safeVendor = buildVendorPublicProfile(vendor);

    res.status(200).json({
      success: true,
      data: safeVendor
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get vendor full profile for admin
// @route   GET /api/vendors/admin/:id
// @access  Private (Admin)
exports.getAdminVendorDetails = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id)
      .populate('user', 'name email avatar isActive isBanned')
      .populate('statusUpdatedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('suspendedBy', 'name email')
      .populate('bannedBy', 'name email')
      .populate('documents.verifiedBy', 'name email')
      .populate('complianceChecks.checkedBy', 'name email');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get vendor by slug
// @route   GET /api/vendors/slug/:slug
// @access  Public
exports.getVendorBySlug = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({
      $or: [{ slug: req.params.slug }, { usernameSlug: req.params.slug }]
    })
      .populate('user', 'name email avatar');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.status(200).json({
      success: true,
      data: buildVendorPublicProfile(vendor)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all vendors
// @route   GET /api/vendors
// @access  Public (approved only)
exports.getAllVendors = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;
    const skip = (page - 1) * limit;

    const query = {
      status: 'approved',
      isActive: true,
      $or: [
        { accountStatus: 'active' },
        { accountStatus: { $exists: false } } // Legacy vendors created before accountStatus
      ]
    };

    if (req.query.category) {
      query.category = req.query.category;
    }

    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }

    let sort = '-createdAt';
    if (req.query.sort === 'rating') {
      sort = '-rating';
    } else if (req.query.sort === 'sales') {
      sort = '-totalSales';
    }

    const vendors = await Vendor.find(query)
      .populate('user', 'name avatar')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Vendor.countDocuments(query);

    res.status(200).json({
      success: true,
      count: vendors.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: vendors.map((vendor) => buildVendorPublicProfile(vendor))
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all vendors for admin
// @route   GET /api/vendors/admin/all
// @access  Private (Admin)
exports.getAdminVendors = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status && req.query.status !== 'all') {
      query.status = req.query.status;
    }
    if (req.query.accountStatus && req.query.accountStatus !== 'all') {
      query.accountStatus = req.query.accountStatus;
    }
    if (req.query.category) {
      query.category = req.query.category;
    }
    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }

    let sort = '-createdAt';
    if (req.query.sort === 'rating') {
      sort = '-rating';
    } else if (req.query.sort === 'sales') {
      sort = '-totalSales';
    }

    const vendors = await Vendor.find(query)
      .populate('user', 'name email avatar isActive isBanned')
      .populate('statusUpdatedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Vendor.countDocuments(query);

    res.status(200).json({
      success: true,
      count: vendors.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: vendors
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all vendors for admin
// @route   GET /api/vendors/admin/all
// @access  Private (Admin)
exports.getAdminVendors = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status && req.query.status !== 'all') {
      query.status = req.query.status;
    }
    if (req.query.accountStatus && req.query.accountStatus !== 'all') {
      query.accountStatus = req.query.accountStatus;
    }
    if (req.query.category) {
      query.category = req.query.category;
    }
    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }

    let sort = '-createdAt';
    if (req.query.sort === 'rating') {
      sort = '-rating';
    } else if (req.query.sort === 'sales') {
      sort = '-totalSales';
    }

    const vendors = await Vendor.find(query)
      .populate('user', 'name email avatar isActive isBanned')
      .populate('statusUpdatedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Vendor.countDocuments(query);

    res.status(200).json({
      success: true,
      count: vendors.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: vendors
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update vendor profile
// @route   PUT /api/vendors/:id
// @access  Private (Vendor/Admin)
exports.updateVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    if (vendor.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this vendor'
      });
    }

    Object.assign(vendor, req.body);
    await vendor.save();

    addActivityLog(vendor, {
      action: req.user.role === 'admin' ? 'vendor.updated.by-admin' : 'vendor.updated.by-owner',
      message: 'Vendor profile updated',
      metadata: { updatedFields: Object.keys(req.body || {}) },
      performedBy: req.user.id,
      performedByRole: req.user.role
    });
    await vendor.save();

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin update vendor profile
// @route   PUT /api/vendors/:id/admin-profile
// @access  Private (Admin)
exports.adminUpdateVendorProfile = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const updatableFields = [
      'storeName',
      'description',
      'category',
      'businessType',
      'taxId',
      'businessLicense',
      'email',
      'phone',
      'website',
      'address',
      'socialMedia',
      'bankDetails',
      'settings'
    ];

    updatableFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        vendor[field] = req.body[field];
      }
    });

    await vendor.save();

    addActivityLog(vendor, {
      action: 'vendor.profile.edited',
      message: 'Admin edited vendor profile',
      metadata: { updatedFields: updatableFields.filter((field) => Object.prototype.hasOwnProperty.call(req.body, field)) },
      performedBy: req.user.id,
      performedByRole: req.user.role
    });
    await vendor.save();

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update vendor account status
// @route   PUT /api/vendors/:id/status
// @access  Private (Admin)
exports.updateVendorStatus = async (req, res, next) => {
  try {
    const { accountStatus, reason } = req.body;
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const user = await User.findById(vendor.user);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Vendor user not found'
      });
    }

    await applyVendorAccountStatus(vendor, user, accountStatus, reason, req.user.id);

    addActivityLog(vendor, {
      action: 'vendor.status.updated',
      message: `Vendor account status changed to ${accountStatus}`,
      metadata: { reason: reason || null },
      performedBy: req.user.id,
      performedByRole: req.user.role
    });
    await vendor.save();

    const accountTemplateByStatus = {
      active: 'account_reinstated',
      suspended: 'account_suspended',
      banned: 'account_banned',
      pending: 'account_status_update'
    };

    await notifyUser({
      user,
      type: 'ACCOUNT',
      title: 'Account status updated',
      message: `Your vendor account status is now ${accountStatus}.`,
      linkUrl: '/vendor/approval-status',
      metadata: {
        event: 'vendor.account-status-updated',
        vendorId: vendor._id.toString(),
        accountStatus,
        reason: reason || null
      },
      emailTemplate: accountTemplateByStatus[accountStatus] || 'account_status_update',
      emailContext: {
        status: accountStatus,
        reason: reason || undefined,
        actionLinks: [{ label: 'Open account status', url: `${process.env.APP_BASE_URL || process.env.FRONTEND_URL || ''}/vendor/approval-status` }]
      },
      actor: {
        actorId: req.user.id,
        actorRole: 'Admin',
        action: 'vendor.status-updated',
        entityType: 'Vendor'
      }
    });

    await AuditLog.create({
      actorId: req.user.id,
      actorRole: 'Admin',
      action: 'vendor.status.updated',
      entityType: 'Vendor',
      entityId: vendor._id,
      metadata: { accountStatus, reason: reason || null, userId: user._id }
    });

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload vendor document
// @route   POST /api/vendors/:id/documents
// @access  Private (Vendor/Admin)
exports.uploadVendorDocument = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    if (vendor.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to upload documents for this vendor'
      });
    }

    let file = { public_id: req.body.public_id || '', url: req.body.url || '' };

    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'nvm/vendor-documents',
            resource_type: 'auto'
          },
          (error, uploadResult) => {
            if (error) reject(error);
            else resolve(uploadResult);
          }
        );
        uploadStream.end(req.file.buffer);
      });

      file = {
        public_id: result.public_id,
        url: result.secure_url
      };
    }

    if (!file.url) {
      return res.status(400).json({
        success: false,
        message: 'Document file is required'
      });
    }

    const document = {
      type: req.body.type,
      name: req.body.name,
      file,
      expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined
    };

    vendor.documents.push(document);

    addActivityLog(vendor, {
      action: 'vendor.document.uploaded',
      message: `Document uploaded (${req.body.type})`,
      metadata: { type: req.body.type, name: req.body.name },
      performedBy: req.user.id,
      performedByRole: req.user.role
    });
    await vendor.save();

    res.status(201).json({
      success: true,
      data: vendor.documents[vendor.documents.length - 1]
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Review vendor document
// @route   PUT /api/vendors/:id/documents/:docId/review
// @access  Private (Admin)
exports.reviewVendorDocument = async (req, res, next) => {
  try {
    const { action, reason } = req.body;
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const document = vendor.documents.id(req.params.docId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    if (action === 'verify') {
      document.status = 'verified';
      document.rejectionReason = undefined;
      document.verifiedBy = req.user.id;
      document.verifiedAt = new Date();
    } else {
      document.status = 'rejected';
      document.rejectionReason = reason || 'Rejected by admin';
      document.verifiedBy = req.user.id;
      document.verifiedAt = new Date();
    }

    addActivityLog(vendor, {
      action: 'vendor.document.reviewed',
      message: `Document ${action === 'verify' ? 'verified' : 'rejected'}`,
      metadata: { documentId: req.params.docId, reason: reason || null },
      performedBy: req.user.id,
      performedByRole: req.user.role
    });
    await vendor.save();

    res.status(200).json({
      success: true,
      data: document
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add compliance check
// @route   POST /api/vendors/:id/compliance-checks
// @access  Private (Admin)
exports.addComplianceCheck = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const check = {
      checkType: req.body.checkType,
      status: req.body.status,
      notes: req.body.notes,
      nextReviewAt: req.body.nextReviewAt ? new Date(req.body.nextReviewAt) : undefined,
      checkedBy: req.user.id
    };

    vendor.complianceChecks.unshift(check);

    addActivityLog(vendor, {
      action: 'vendor.compliance.checked',
      message: `Compliance check recorded: ${check.checkType} (${check.status})`,
      metadata: { checkType: check.checkType, status: check.status },
      performedBy: req.user.id,
      performedByRole: req.user.role
    });
    await vendor.save();

    res.status(201).json({
      success: true,
      data: vendor.complianceChecks[0]
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get vendor documents (paginated)
// @route   GET /api/vendors/:id/documents
// @access  Private (Admin)
exports.getVendorDocuments = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id)
      .populate('documents.verifiedBy', 'name email');
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const status = req.query.status;
    const type = req.query.type;

    let documents = Array.isArray(vendor.documents) ? vendor.documents : [];
    if (status && status !== 'all') {
      documents = documents.filter((doc) => doc.status === status);
    }
    if (type && type !== 'all') {
      documents = documents.filter((doc) => doc.type === type);
    }

    const total = documents.length;
    const start = (page - 1) * limit;
    const paginated = documents.slice(start, start + limit);

    res.status(200).json({
      success: true,
      count: paginated.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: paginated
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get vendor activity logs
// @route   GET /api/vendors/:id/activity-logs
// @access  Private (Admin)
exports.getVendorActivityLogs = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id)
      .populate('activityLogs.performedBy', 'name email');
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const action = req.query.action;

    let logs = Array.isArray(vendor.activityLogs) ? vendor.activityLogs : [];
    if (action) {
      logs = logs.filter((log) => log.action === action);
    }

    const total = logs.length;
    const start = (page - 1) * limit;
    const paginated = logs.slice(start, start + limit);

    res.status(200).json({
      success: true,
      count: paginated.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: paginated
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get vendor performance overview
// @route   GET /api/vendors/:id/performance
// @access  Private (Admin)
exports.getVendorPerformanceOverview = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const productCount = await Product.countDocuments({ vendor: vendor._id, isActive: true });
    const reviewSummary = await Review.aggregate([
      { $match: { vendor: vendor._id, isApproved: true, isActive: true } },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          averageRating: { $avg: '$rating' }
        }
      }
    ]);

    const orderSummary = await Order.aggregate([
      { $unwind: '$items' },
      { $match: { 'items.vendor': vendor._id } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          completedOrders: {
            $sum: {
              $cond: [{ $in: ['$items.status', ['delivered', 'confirmed']] }, 1, 0]
            }
          },
          totalSales: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.subtotal' }
        }
      }
    ]);

    const reviewData = reviewSummary[0] || { totalReviews: 0, averageRating: 0 };
    const orderData = orderSummary[0] || { totalOrders: 0, completedOrders: 0, totalSales: 0, totalRevenue: 0 };

    res.status(200).json({
      success: true,
      data: {
        vendor: {
          id: vendor._id,
          storeName: vendor.storeName,
          status: vendor.status,
          accountStatus: vendor.accountStatus
        },
        metrics: {
          totalProducts: productCount,
          totalOrders: orderData.totalOrders,
          completedOrders: orderData.completedOrders,
          totalSales: orderData.totalSales,
          totalRevenue: orderData.totalRevenue,
          totalReviews: reviewData.totalReviews,
          averageRating: Number((reviewData.averageRating || 0).toFixed(2))
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get my vendor profile
// @route   GET /api/vendors/me/profile
// @access  Private (Vendor)
exports.getMyVendorProfile = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user.id })
      .populate('user', 'name email avatar');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get public storefront profile by slug
// @route   GET /api/vendors/:slug/profile
// @access  Public
exports.getPublicVendorProfileBySlug = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({
      $or: [{ usernameSlug: req.params.slug }, { slug: req.params.slug }]
    }).populate('user', 'name avatar');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }

    const profile = buildVendorPublicProfile(vendor);

    res.status(200).json({
      success: true,
      data: profile
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get storefront profile by vendor ID (owner/admin)
// @route   GET /api/vendors/:vendorId/profile
// @access  Private (Vendor/Admin)
exports.getVendorProfileByVendorId = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.vendorId).populate('user', 'name email avatar');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }

    if (vendor.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this vendor profile'
      });
    }

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create/update storefront profile by vendor ID
// @route   POST|PUT /api/vendors/:vendorId/profile
// @access  Private (Vendor/Admin)
exports.upsertVendorProfile = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.vendorId);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }

    if (vendor.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this vendor profile'
      });
    }

    const nextSlug = req.body.usernameSlug
      ? toSlug(req.body.usernameSlug)
      : (req.body.storeName ? toSlug(req.body.storeName) : vendor.usernameSlug || vendor.slug);

    const existingSlugOwner = await Vendor.findOne({
      _id: { $ne: vendor._id },
      $or: [{ usernameSlug: nextSlug }, { slug: nextSlug }]
    });

    if (existingSlugOwner) {
      return res.status(400).json({
        success: false,
        message: 'This store URL is already taken. Choose a different slug.'
      });
    }

    const fields = [
      'storeName',
      'bio',
      'about',
      'description',
      'category',
      'businessType',
      'phone',
      'email',
      'website',
      'businessHours',
      'socialLinks',
      'privacy',
      'location',
      'address',
      'policies'
    ];

    fields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        vendor[field] = req.body[field];
      }
    });

    vendor.usernameSlug = nextSlug;
    vendor.slug = nextSlug;

    if (!vendor.description && vendor.about) {
      vendor.description = vendor.about;
    }
    if (!vendor.bio && vendor.description) {
      vendor.bio = vendor.description;
    }

    // Keep old fields in sync for legacy UI.
    if (vendor.location) {
      vendor.address = {
        ...(vendor.address || {}),
        country: vendor.location.country || vendor.address?.country || '',
        state: vendor.location.state || vendor.address?.state || '',
        city: vendor.location.city || vendor.address?.city || '',
        street: vendor.location.addressLine || vendor.address?.street || '',
        zipCode: vendor.address?.zipCode || ''
      };
    }
    if (vendor.socialLinks) {
      vendor.socialMedia = {
        ...(vendor.socialMedia || {}),
        facebook: vendor.socialLinks.facebook || vendor.socialMedia?.facebook || '',
        instagram: vendor.socialLinks.instagram || vendor.socialMedia?.instagram || ''
      };
      if (vendor.socialLinks.website) {
        vendor.website = vendor.socialLinks.website;
      }
    }

    await vendor.save();

    addActivityLog(vendor, {
      action: 'vendor.storefront.updated',
      message: 'Vendor storefront profile updated',
      metadata: { updatedFields: Object.keys(req.body || {}) },
      performedBy: req.user.id,
      performedByRole: req.user.role
    });
    await vendor.save();

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload vendor storefront images
// @route   PUT /api/vendors/:vendorId/profile/images
// @access  Private (Vendor/Admin)
exports.uploadVendorProfileImages = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.vendorId);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }

    if (vendor.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this vendor profile'
      });
    }

    const profileFile = req.files?.profileImage?.[0];
    const coverFile = req.files?.coverImage?.[0];

    if (!profileFile && !coverFile) {
      return res.status(400).json({
        success: false,
        message: 'No images uploaded. Provide profileImage and/or coverImage.'
      });
    }

    if (profileFile) {
      const profileImage = await uploadVendorImage(profileFile.buffer, 'profile', [
        { width: 600, height: 600, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ]);
      vendor.profileImage = profileImage;
      vendor.logo = profileImage;
    }

    if (coverFile) {
      const coverImage = await uploadVendorImage(coverFile.buffer, 'cover', [
        { width: 1800, height: 700, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ]);
      vendor.coverImage = coverImage;
      vendor.banner = coverImage;
    }

    await vendor.save();

    addActivityLog(vendor, {
      action: 'vendor.storefront.images.updated',
      message: 'Vendor storefront images updated',
      performedBy: req.user.id,
      performedByRole: req.user.role
    });
    await vendor.save();

    res.status(200).json({
      success: true,
      data: {
        profileImage: vendor.profileImage || vendor.logo,
        coverImage: vendor.coverImage || vendor.banner
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get vendor analytics
// @route   GET /api/vendors/:id/analytics
// @access  Private (Vendor/Admin)
exports.getVendorAnalytics = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    if (vendor.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const productCount = await Product.countDocuments({ vendor: vendor._id });
    const activeProducts = await Product.countDocuments({
      vendor: vendor._id,
      status: 'active'
    });

    const analytics = {
      totalProducts: productCount,
      activeProducts,
      totalSales: vendor.totalSales,
      totalRevenue: vendor.totalRevenue,
      rating: vendor.rating,
      totalReviews: vendor.totalReviews
    };

    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve vendor (Admin)
// @route   PUT /api/vendors/:id/approve
// @access  Private (Admin)
exports.approveVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id).populate('user');
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const user = await User.findById(vendor.user._id);
    await applyVendorAccountStatus(vendor, user, 'active', null, req.user.id);

    addActivityLog(vendor, {
      action: 'vendor.approved',
      message: 'Vendor approved by admin',
      performedBy: req.user.id,
      performedByRole: req.user.role
    });
    await vendor.save();

    await notifyUser({
      user,
      type: 'APPROVAL',
      title: 'Vendor application approved',
      message: `${vendor.storeName} is approved and active.`,
      linkUrl: '/vendor/dashboard',
      metadata: { event: 'vendor.approved', vendorId: vendor._id.toString() },
      emailTemplate: 'vendor_approved',
      emailContext: {
        vendorName: vendor.storeName,
        actionLinks: [{ label: 'Go to dashboard', url: `${process.env.APP_BASE_URL || process.env.FRONTEND_URL || ''}/vendor/dashboard` }]
      },
      actor: {
        actorId: req.user.id,
        actorRole: 'Admin',
        action: 'vendor.approved',
        entityType: 'Vendor'
      }
    });

    await AuditLog.create({
      actorId: req.user.id,
      actorRole: 'Admin',
      action: 'vendor.approved',
      entityType: 'Vendor',
      entityId: vendor._id,
      metadata: { userId: user._id }
    });

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reject vendor (Admin)
// @route   PUT /api/vendors/:id/reject
// @access  Private (Admin)
exports.rejectVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    vendor.status = 'rejected';
    vendor.accountStatus = 'suspended';
    vendor.rejectionReason = req.body.reason || 'Rejected by admin';
    vendor.statusUpdatedAt = new Date();
    vendor.statusUpdatedBy = req.user.id;
    vendor.isActive = false;

    const user = await User.findById(vendor.user);
    if (user) {
      user.isActive = false;
      user.isBanned = false;
      await user.save();
    }

    addActivityLog(vendor, {
      action: 'vendor.rejected',
      message: 'Vendor rejected by admin',
      metadata: { reason: req.body.reason || null },
      performedBy: req.user.id,
      performedByRole: req.user.role
    });
    await vendor.save();

    if (user) {
      await notifyUser({
        user,
        type: 'APPROVAL',
        title: 'Vendor application rejected',
        message: req.body.reason
          ? `Reason: ${req.body.reason}`
          : 'Your vendor registration was rejected.',
        linkUrl: '/vendor/approval-status',
        metadata: {
          event: 'vendor.rejected',
          vendorId: vendor._id.toString(),
          reason: req.body.reason || null
        },
        emailTemplate: 'vendor_rejected',
        emailContext: {
          status: req.body.reason || 'rejected',
          actionLinks: [{ label: 'Review status', url: `${process.env.APP_BASE_URL || process.env.FRONTEND_URL || ''}/vendor/approval-status` }]
        },
        actor: {
          actorId: req.user.id,
          actorRole: 'Admin',
          action: 'vendor.rejected',
          entityType: 'Vendor'
        }
      });
    }

    await AuditLog.create({
      actorId: req.user.id,
      actorRole: 'Admin',
      action: 'vendor.rejected',
      entityType: 'Vendor',
      entityId: vendor._id,
      metadata: { reason: req.body.reason || null, userId: vendor.user }
    });

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
};
