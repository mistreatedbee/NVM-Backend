const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Order = require('../models/Order');
const Review = require('../models/Review');
const AuditLog = require('../models/AuditLog');
const VendorDocument = require('../models/VendorDocument');
const cloudinary = require('../utils/cloudinary');
const { notifyUser } = require('../services/notificationService');
const { buildAppUrl } = require('../utils/appUrl');

const DOC_TYPES = new Set(['BUSINESS_REG', 'COMPLIANCE', 'ID', 'TAX', 'OTHER']);

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

function normalizeVerificationStatus(value) {
  if (!value) return 'UNVERIFIED';
  if (value === 'verified') return 'VERIFIED';
  if (value === 'pending') return 'UNVERIFIED';
  return value;
}

function normalizeVendorStatus(value) {
  if (!value) return 'PENDING';
  if (value === 'approved') return 'ACTIVE';
  if (value === 'pending') return 'PENDING';
  if (value === 'suspended') return 'SUSPENDED';
  if (value === 'rejected') return 'REJECTED';
  return value;
}

function mapVendorStatuses(vendor) {
  return {
    vendorStatus: vendor.vendorStatus || normalizeVendorStatus(vendor.status),
    verificationStatus: normalizeVerificationStatus(vendor.verificationStatus)
  };
}

async function createAdminAuditLog({ req, actionType, targetVendorId, metadata }) {
  return AuditLog.create({
    actorAdminId: req.user.id,
    actorId: req.user.id,
    actorRole: 'Admin',
    actionType,
    action: actionType,
    targetVendorId,
    entityType: 'Vendor',
    entityId: targetVendorId,
    metadata: metadata || {}
  });
}

function updateVendorStatuses(vendor, { vendorStatus, verificationStatus, reason, actorId }) {
  const now = new Date();

  vendor.vendorStatus = vendorStatus;
  if (verificationStatus) {
    vendor.verificationStatus = verificationStatus;
  }

  if (vendorStatus === 'ACTIVE') {
    vendor.status = 'approved';
    vendor.accountStatus = 'active';
    vendor.isActive = true;
    vendor.approvedAt = now;
    vendor.approvedBy = actorId;
    vendor.approval = { approvedAt: now, approvedBy: actorId };
    vendor.rejectionReason = undefined;
    vendor.suspensionReason = undefined;
    vendor.rejection = undefined;
    vendor.suspension = undefined;
  }

  if (vendorStatus === 'SUSPENDED') {
    vendor.status = 'suspended';
    vendor.accountStatus = 'suspended';
    vendor.isActive = false;
    vendor.suspensionReason = reason || 'Suspended by admin';
    vendor.suspendedAt = now;
    vendor.suspendedBy = actorId;
    vendor.suspension = {
      suspendedAt: now,
      suspendedBy: actorId,
      suspensionReason: reason || 'Suspended by admin'
    };
  }

  if (vendorStatus === 'REJECTED') {
    vendor.status = 'rejected';
    vendor.accountStatus = 'suspended';
    vendor.isActive = false;
    vendor.rejectionReason = reason || 'Rejected by admin';
    vendor.rejection = {
      rejectedAt: now,
      rejectedBy: actorId,
      rejectionReason: reason || 'Rejected by admin'
    };
  }
}

async function applyVendorUserState(vendor, { active }) {
  const user = await User.findById(vendor.user);
  if (!user) return null;

  user.isActive = Boolean(active);
  user.isBanned = false;
  if (user.role !== 'admin') {
    user.role = 'vendor';
  }
  await user.save();
  return user;
}

async function getVendorMetrics(vendorId) {
  const objectId = new mongoose.Types.ObjectId(vendorId);

  const orderAgg = await Order.aggregate([
    { $match: { 'items.vendor': objectId } },
    { $unwind: '$items' },
    { $match: { 'items.vendor': objectId } },
    {
      $group: {
        _id: '$_id',
        vendorOrderAmount: { $sum: { $ifNull: ['$items.subtotal', 0] } },
        paidOrCompleted: {
          $max: {
            $cond: [
              {
                $or: [
                  { $eq: ['$paymentStatus', 'paid'] },
                  { $in: ['$status', ['confirmed', 'delivered']] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalSales: {
          $sum: {
            $cond: [{ $eq: ['$paidOrCompleted', 1] }, '$vendorOrderAmount', 0]
          }
        }
      }
    }
  ]);

  const reviewAgg = await Review.aggregate([
    {
      $match: {
        targetType: 'VENDOR',
        vendorId: objectId,
        status: 'APPROVED'
      }
    },
    {
      $group: {
        _id: null,
        totalReviews: { $sum: 1 },
        avgRating: { $avg: '$rating' }
      }
    }
  ]);

  const recentOrders = await Order.aggregate([
    { $match: { 'items.vendor': objectId } },
    { $sort: { createdAt: -1 } },
    { $limit: 10 },
    {
      $project: {
        _id: 1,
        orderNumber: 1,
        customer: 1,
        status: 1,
        paymentStatus: 1,
        createdAt: 1,
        items: {
          $filter: {
            input: '$items',
            as: 'item',
            cond: { $eq: ['$$item.vendor', objectId] }
          }
        }
      }
    },
    {
      $addFields: {
        vendorAmount: {
          $sum: {
            $map: {
              input: '$items',
              as: 'item',
              in: { $ifNull: ['$$item.subtotal', 0] }
            }
          }
        }
      }
    }
  ]);

  return {
    totalOrders: orderAgg[0]?.totalOrders || 0,
    totalSales: Number((orderAgg[0]?.totalSales || 0).toFixed(2)),
    totalReviews: reviewAgg[0]?.totalReviews || 0,
    avgRating: Number(((reviewAgg[0]?.avgRating || 0)).toFixed(2)),
    recentOrders
  };
}

async function uploadDocumentToCloudinary(fileBuffer) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    const error = new Error('Document upload service is not configured');
    error.statusCode = 503;
    throw error;
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'nvm/vendor-documents',
        resource_type: 'auto'
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
}

exports.getAdminVendors = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const andClauses = [];

    if (req.query.status && req.query.status !== 'all') {
      const requestedStatus = req.query.status;
      const legacyStatusMap = {
        ACTIVE: 'approved',
        PENDING: 'pending',
        SUSPENDED: 'suspended',
        REJECTED: 'rejected'
      };
      andClauses.push({
        $or: [
          { vendorStatus: requestedStatus },
          { vendorStatus: { $exists: false }, status: legacyStatusMap[requestedStatus] }
        ]
      });
    }
    if (req.query.verified && req.query.verified !== 'all') {
      const requestedVerification = req.query.verified;
      const verificationOr = [{ verificationStatus: requestedVerification }];
      if (requestedVerification === 'UNVERIFIED') {
        verificationOr.push({ verificationStatus: 'pending' });
      }
      if (requestedVerification === 'VERIFIED') {
        verificationOr.push({ verificationStatus: 'verified' });
      }
      andClauses.push({ $or: verificationOr });
    }
    if (req.query.q) {
      andClauses.push({
        $or: [
          { storeName: { $regex: req.query.q, $options: 'i' } },
          { email: { $regex: req.query.q, $options: 'i' } },
          { phone: { $regex: req.query.q, $options: 'i' } }
        ]
      });
    }

    const query = andClauses.length ? { $and: andClauses } : {};

    const [vendors, total] = await Promise.all([
      Vendor.find(query)
        .populate('user', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Vendor.countDocuments(query)
    ]);

    const data = vendors.map((vendor) => {
      const mapped = mapVendorStatuses(vendor);
      return {
        ...vendor.toObject(),
        vendorStatus: mapped.vendorStatus,
        verificationStatus: mapped.verificationStatus
      };
    });

    return res.status(200).json({
      success: true,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      data
    });
  } catch (error) {
    return next(error);
  }
};

exports.getAdminVendorById = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.vendorId)
      .populate('user', 'name email role isActive isBanned')
      .populate('approval.approvedBy', 'name email')
      .populate('suspension.suspendedBy', 'name email')
      .populate('rejection.rejectedBy', 'name email');

    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const [metrics, documents] = await Promise.all([
      getVendorMetrics(vendor._id),
      VendorDocument.find({ vendorId: vendor._id }).sort({ uploadedAt: -1 }).limit(20)
    ]);

    const mapped = mapVendorStatuses(vendor);
    return res.status(200).json({
      success: true,
      data: {
        ...vendor.toObject(),
        vendorStatus: mapped.vendorStatus,
        verificationStatus: mapped.verificationStatus,
        metrics,
        documents
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.approveVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const previousStatus = vendor.vendorStatus || normalizeVendorStatus(vendor.status);
    updateVendorStatuses(vendor, {
      vendorStatus: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      actorId: req.user.id
    });
    await vendor.save();

    const user = await applyVendorUserState(vendor, { active: true });
    await createAdminAuditLog({
      req,
      actionType: 'VENDOR_APPROVE',
      targetVendorId: vendor._id,
      metadata: { previousStatus, newStatus: 'ACTIVE' }
    });

    if (user) {
      await notifyUser({
        user,
        type: 'APPROVAL',
        subType: 'VENDOR_APPROVED',
        title: 'Vendor account approved',
        message: 'Your vendor account is now active and verified.',
        linkUrl: '/vendor/dashboard',
        metadata: { event: 'vendor.approved', vendorId: vendor._id.toString() },
        emailTemplate: 'vendor_approved',
        emailContext: {
          vendorName: vendor.storeName,
          actionLinks: [{ label: 'Open dashboard', url: buildAppUrl('/vendor/dashboard') }]
        }
      });
    }

    return res.status(200).json({ success: true, data: vendor });
  } catch (error) {
    return next(error);
  }
};

exports.rejectVendor = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ success: false, message: 'reason is required' });
    }

    const vendor = await Vendor.findById(req.params.vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const previousStatus = vendor.vendorStatus || normalizeVendorStatus(vendor.status);
    updateVendorStatuses(vendor, {
      vendorStatus: 'REJECTED',
      verificationStatus: 'REJECTED',
      reason,
      actorId: req.user.id
    });
    await vendor.save();

    const user = await applyVendorUserState(vendor, { active: false });
    await createAdminAuditLog({
      req,
      actionType: 'VENDOR_REJECT',
      targetVendorId: vendor._id,
      metadata: { previousStatus, newStatus: 'REJECTED', reason }
    });

    if (user) {
      await notifyUser({
        user,
        type: 'APPROVAL',
        subType: 'VENDOR_REJECTED',
        title: 'Vendor account rejected',
        message: reason,
        linkUrl: '/vendor/approval-status',
        metadata: { event: 'vendor.rejected', vendorId: vendor._id.toString(), reason },
        emailTemplate: 'vendor_rejected',
        emailContext: {
          status: reason,
          actionLinks: [{ label: 'Review status', url: buildAppUrl('/vendor/approval-status') }]
        }
      });
    }

    return res.status(200).json({ success: true, data: vendor });
  } catch (error) {
    return next(error);
  }
};

exports.suspendVendor = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ success: false, message: 'reason is required' });
    }

    const vendor = await Vendor.findById(req.params.vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const previousStatus = vendor.vendorStatus || normalizeVendorStatus(vendor.status);
    updateVendorStatuses(vendor, {
      vendorStatus: 'SUSPENDED',
      reason,
      actorId: req.user.id
    });
    await vendor.save();

    const user = await applyVendorUserState(vendor, { active: false });
    await createAdminAuditLog({
      req,
      actionType: 'VENDOR_SUSPEND',
      targetVendorId: vendor._id,
      metadata: { previousStatus, newStatus: 'SUSPENDED', reason }
    });

    if (user) {
      await notifyUser({
        user,
        type: 'ACCOUNT',
        subType: 'ACCOUNT_SUSPENDED',
        title: 'Vendor account suspended',
        message: reason,
        linkUrl: '/vendor/approval-status',
        metadata: { event: 'vendor.suspended', vendorId: vendor._id.toString(), reason },
        emailTemplate: 'account_suspended',
        emailContext: {
          status: reason,
          actionLinks: [{ label: 'View status', url: buildAppUrl('/vendor/approval-status') }]
        }
      });
    }

    return res.status(200).json({ success: true, data: vendor });
  } catch (error) {
    return next(error);
  }
};

exports.unsuspendVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const previousStatus = vendor.vendorStatus || normalizeVendorStatus(vendor.status);
    updateVendorStatuses(vendor, {
      vendorStatus: 'ACTIVE',
      verificationStatus: normalizeVerificationStatus(vendor.verificationStatus) === 'REJECTED' ? 'UNVERIFIED' : normalizeVerificationStatus(vendor.verificationStatus),
      actorId: req.user.id
    });
    vendor.suspensionReason = undefined;
    vendor.suspendedAt = undefined;
    vendor.suspendedBy = undefined;
    vendor.suspension = undefined;
    await vendor.save();

    const user = await applyVendorUserState(vendor, { active: true });
    await createAdminAuditLog({
      req,
      actionType: 'VENDOR_UNSUSPEND',
      targetVendorId: vendor._id,
      metadata: { previousStatus, newStatus: 'ACTIVE' }
    });

    if (user) {
      await notifyUser({
        user,
        type: 'ACCOUNT',
        subType: 'ACCOUNT_UNSUSPENDED',
        title: 'Vendor account restored',
        message: 'Your vendor account suspension has been removed.',
        linkUrl: '/vendor/dashboard',
        metadata: { event: 'vendor.unsuspended', vendorId: vendor._id.toString() },
        emailTemplate: 'account_reinstated',
        emailContext: {
          actionLinks: [{ label: 'Open dashboard', url: buildAppUrl('/vendor/dashboard') }]
        }
      });
    }

    return res.status(200).json({ success: true, data: vendor });
  } catch (error) {
    return next(error);
  }
};

exports.adminEditVendorProfile = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const editableFields = [
      'storeName',
      'phone',
      'email',
      'location',
      'address',
      'description',
      'about',
      'bio',
      'website',
      'category',
      'businessType',
      'socialLinks',
      'privacy'
    ];

    const previous = {};
    const updated = {};

    editableFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        previous[field] = vendor[field];
        vendor[field] = req.body[field];
        updated[field] = req.body[field];
      }
    });

    await vendor.save();
    await createAdminAuditLog({
      req,
      actionType: 'ADMIN_EDIT_VENDOR',
      targetVendorId: vendor._id,
      metadata: { previous, updated }
    });

    return res.status(200).json({ success: true, data: vendor });
  } catch (error) {
    return next(error);
  }
};

exports.uploadVendorDocument = async (req, res, next) => {
  try {
    const { docType } = req.body;
    if (!DOC_TYPES.has(docType)) {
      return res.status(400).json({ success: false, message: 'Invalid docType' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'file is required' });
    }

    const vendor = await Vendor.findOne({ user: req.user.id });
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    }

    const uploadResult = await uploadDocumentToCloudinary(req.file.buffer);
    const document = await VendorDocument.create({
      vendorId: vendor._id,
      docType,
      fileName: req.file.originalname,
      fileUrl: uploadResult.secure_url,
      storageKey: uploadResult.public_id,
      mimeType: req.file.mimetype,
      size: req.file.size,
      status: 'UPLOADED',
      uploadedAt: new Date()
    });

    return res.status(201).json({ success: true, data: document });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorDocuments = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user.id }).select('_id');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    }

    const documents = await VendorDocument.find({ vendorId: vendor._id })
      .sort({ uploadedAt: -1 });

    return res.status(200).json({ success: true, data: documents });
  } catch (error) {
    return next(error);
  }
};

exports.deleteVendorDocument = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user.id }).select('_id');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    }

    const document = await VendorDocument.findOne({
      _id: req.params.docId,
      vendorId: vendor._id
    });

    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    if (document.status === 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: 'Approved documents cannot be deleted'
      });
    }

    if (document.storageKey) {
      try {
        await cloudinary.uploader.destroy(document.storageKey, { resource_type: 'raw' });
      } catch (_error) {
        // Ignore storage deletion errors and still remove DB record.
      }
    }

    await VendorDocument.deleteOne({ _id: document._id });
    return res.status(200).json({ success: true, message: 'Document deleted' });
  } catch (error) {
    return next(error);
  }
};

exports.getAdminVendorDocuments = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const query = { vendorId: req.params.vendorId };
    if (req.query.status && req.query.status !== 'all') {
      query.status = req.query.status;
    }
    if (req.query.docType && req.query.docType !== 'all') {
      query.docType = req.query.docType;
    }

    const [documents, total] = await Promise.all([
      VendorDocument.find(query)
        .populate('reviewedBy', 'name email')
        .sort({ uploadedAt: -1 })
        .skip(skip)
        .limit(limit),
      VendorDocument.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      data: documents
    });
  } catch (error) {
    return next(error);
  }
};

exports.approveDocument = async (req, res, next) => {
  try {
    const document = await VendorDocument.findById(req.params.docId);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    document.status = 'APPROVED';
    document.reviewedAt = new Date();
    document.reviewedBy = req.user.id;
    document.reviewNote = '';
    await document.save();

    await createAdminAuditLog({
      req,
      actionType: 'DOC_APPROVE',
      targetVendorId: document.vendorId,
      metadata: { docId: document._id.toString(), newStatus: 'APPROVED' }
    });

    const vendor = await Vendor.findById(document.vendorId);
    const user = vendor ? await User.findById(vendor.user).select('name email role') : null;
    if (user) {
      await notifyUser({
        user,
        type: 'APPROVAL',
        subType: 'VENDOR_DOCUMENT_APPROVED',
        title: 'Document approved',
        message: `${document.docType} document was approved.`,
        linkUrl: '/vendor/documents',
        metadata: { event: 'vendor.document.approved', docId: document._id.toString() }
      });
    }

    return res.status(200).json({ success: true, data: document });
  } catch (error) {
    return next(error);
  }
};

exports.rejectDocument = async (req, res, next) => {
  try {
    const { note } = req.body;
    const document = await VendorDocument.findById(req.params.docId);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    document.status = 'REJECTED';
    document.reviewedAt = new Date();
    document.reviewedBy = req.user.id;
    document.reviewNote = note || '';
    await document.save();

    await createAdminAuditLog({
      req,
      actionType: 'DOC_REJECT',
      targetVendorId: document.vendorId,
      metadata: { docId: document._id.toString(), newStatus: 'REJECTED', note: note || null }
    });

    const vendor = await Vendor.findById(document.vendorId);
    const user = vendor ? await User.findById(vendor.user).select('name email role') : null;
    if (user) {
      await notifyUser({
        user,
        type: 'APPROVAL',
        subType: 'VENDOR_DOCUMENT_REJECTED',
        title: 'Document rejected',
        message: note || `${document.docType} document was rejected.`,
        linkUrl: '/vendor/documents',
        metadata: { event: 'vendor.document.rejected', docId: document._id.toString(), note: note || null }
      });
    }

    return res.status(200).json({ success: true, data: document });
  } catch (error) {
    return next(error);
  }
};

exports.getAdminVendorMetrics = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.vendorId).select('_id storeName');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const metrics = await getVendorMetrics(vendor._id);
    return res.status(200).json({
      success: true,
      data: {
        vendorId: vendor._id,
        storeName: vendor.storeName,
        ...metrics
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorMetrics = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user.id }).select('_id storeName');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    }

    const metrics = await getVendorMetrics(vendor._id);
    return res.status(200).json({
      success: true,
      data: {
        vendorId: vendor._id,
        storeName: vendor.storeName,
        ...metrics
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.getAdminAuditLogs = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};
    if (req.query.vendorId) {
      query.targetVendorId = req.query.vendorId;
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('actorAdminId', 'name email')
        .populate('targetVendorId', 'storeName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      data: logs
    });
  } catch (error) {
    return next(error);
  }
};
