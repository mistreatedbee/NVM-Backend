const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
const ProhibitedRule = require('../models/ProhibitedRule');
const CMSPage = require('../models/CMSPage');
const Banner = require('../models/Banner');
const HomepageSection = require('../models/HomepageSection');
const Vendor = require('../models/Vendor');
const VendorDocument = require('../models/VendorDocument');
const User = require('../models/User');
const RefundRequest = require('../models/RefundRequest');
const FraudFlag = require('../models/FraudFlag');
const Report = require('../models/Report');
const Order = require('../models/Order');
const Dispute = require('../models/Dispute');
const ActivityLog = require('../models/ActivityLog');
const AuditLog = require('../models/AuditLog');
const ProductHistory = require('../models/ProductHistory');
const { logAudit, resolveIp } = require('../services/loggingService');

function parsePagination(query, defaultLimit = 20) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

function rx(value) {
  return { $regex: String(value || '').trim(), $options: 'i' };
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function parseDateRange(query) {
  const out = {};
  if (query.dateFrom || query.dateTo) {
    out.createdAt = {};
    if (query.dateFrom) {
      const from = new Date(query.dateFrom);
      if (!Number.isNaN(from.getTime())) out.createdAt.$gte = from;
    }
    if (query.dateTo) {
      const to = new Date(query.dateTo);
      if (!Number.isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        out.createdAt.$lte = to;
      }
    }
    if (!Object.keys(out.createdAt).length) delete out.createdAt;
  }
  return out;
}

async function audit(req, actionType, targetType, targetId, reason = '', metadata = {}) {
  return logAudit({
    actorAdminId: req.user.id,
    actionType,
    targetType,
    targetId,
    reason,
    metadata,
    ipAddress: resolveIp(req),
    userAgent: req.headers['user-agent'] || ''
  });
}

function paged(res, data, total, page, limit) {
  return res.status(200).json({ success: true, data, total, page, limit, pages: Math.ceil(total / limit) });
}

exports.getAdminCategories = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};
    if (req.query.active === 'true' || req.query.active === 'false') query.isActive = req.query.active === 'true';
    if (req.query.q) query.$or = [{ name: rx(req.query.q) }, { slug: rx(req.query.q) }, { description: rx(req.query.q) }];

    const [data, total] = await Promise.all([
      Category.find(query).sort({ sortOrder: 1, order: 1, createdAt: -1 }).skip(skip).limit(limit),
      Category.countDocuments(query)
    ]);
    return paged(res, data, total, page, limit);
  } catch (error) { return next(error); }
};

exports.createAdminCategory = async (req, res, next) => {
  try {
    const category = await Category.create({
      name: req.body?.name,
      description: req.body?.description || '',
      imageUrl: req.body?.imageUrl || '',
      isActive: req.body?.isActive !== false,
      isFeatured: Boolean(req.body?.isFeatured),
      sortOrder: Number(req.body?.sortOrder || 0),
      order: Number(req.body?.sortOrder || 0)
    });
    await audit(req, 'CATEGORY_CREATE', 'CATEGORY', category._id, '', { new: category.toObject() });
    return res.status(201).json({ success: true, data: category });
  } catch (error) { return next(error); }
};

exports.updateAdminCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    const oldDoc = category.toObject();
    ['name', 'description', 'imageUrl', 'isActive', 'isFeatured', 'sortOrder'].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) category[key] = req.body[key];
    });
    category.order = category.sortOrder || 0;
    await category.save();

    await audit(req, 'CATEGORY_UPDATE', 'CATEGORY', category._id, '', { old: oldDoc, new: category.toObject() });
    return res.status(200).json({ success: true, data: category });
  } catch (error) { return next(error); }
};

exports.featureAdminCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    const oldValue = category.isFeatured;
    category.isFeatured = Boolean(req.body?.isFeatured);
    await category.save();
    await audit(req, 'CATEGORY_FEATURE', 'CATEGORY', category._id, '', { old: oldValue, new: category.isFeatured });
    return res.status(200).json({ success: true, data: category });
  } catch (error) { return next(error); }
};

exports.reorderAdminCategories = async (req, res, next) => {
  try {
    if (Array.isArray(req.body?.orderedIds) && req.body.orderedIds.length) {
      const ops = req.body.orderedIds.filter(isObjectId).map((id, index) => ({
        updateOne: { filter: { _id: id }, update: { $set: { sortOrder: index, order: index } } }
      }));
      if (!ops.length) return res.status(400).json({ success: false, message: 'No valid ids' });
      await Category.bulkWrite(ops);
      await audit(req, 'CATEGORY_REORDER', 'CATEGORY', null, '', { orderedIds: req.body.orderedIds });
      return res.status(200).json({ success: true, message: 'Reordered' });
    }

    if (Array.isArray(req.body?.items) && req.body.items.length) {
      const ops = req.body.items.filter((item) => isObjectId(item?.id)).map((item) => ({
        updateOne: { filter: { _id: item.id }, update: { $set: { sortOrder: Number(item.sortOrder || 0), order: Number(item.sortOrder || 0) } } }
      }));
      if (!ops.length) return res.status(400).json({ success: false, message: 'No valid items' });
      await Category.bulkWrite(ops);
      await audit(req, 'CATEGORY_REORDER', 'CATEGORY', null, '', { items: req.body.items });
      return res.status(200).json({ success: true, message: 'Reordered' });
    }

    return res.status(400).json({ success: false, message: 'Provide orderedIds or items' });
  } catch (error) { return next(error); }
};

exports.deactivateAdminCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    const oldValue = category.isActive;
    category.isActive = Boolean(req.body?.isActive);
    await category.save();

    if (!category.isActive && req.body?.unpublishProducts === true) {
      await Product.updateMany({ category: category._id }, { $set: { isActive: false } });
    }

    await audit(req, 'CATEGORY_DEACTIVATE', 'CATEGORY', category._id, '', {
      old: oldValue,
      new: category.isActive,
      unpublishProducts: Boolean(req.body?.unpublishProducts)
    });

    return res.status(200).json({ success: true, data: category });
  } catch (error) { return next(error); }
};

exports.deleteAdminCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    await Category.deleteOne({ _id: category._id });
    await audit(req, 'CATEGORY_DELETE', 'CATEGORY', category._id, String(req.body?.reason || ''), { deleted: category.toObject() });
    return res.status(200).json({ success: true, message: 'Deleted' });
  } catch (error) { return next(error); }
};

exports.getProhibitedRules = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};
    if (req.query.q) query.$or = [{ keyword: rx(req.query.q) }, { phrase: rx(req.query.q) }, { 'attribute.key': rx(req.query.q) }, { 'attribute.value': rx(req.query.q) }];

    const [data, total] = await Promise.all([
      ProhibitedRule.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ProhibitedRule.countDocuments(query)
    ]);
    return paged(res, data, total, page, limit);
  } catch (error) { return next(error); }
};

exports.createProhibitedRule = async (req, res, next) => {
  try {
    const rule = await ProhibitedRule.create(req.body || {});
    await audit(req, 'PROHIBITED_RULE_CREATE', 'PROHIBITED_RULE', rule._id, '', { new: rule.toObject() });
    return res.status(201).json({ success: true, data: rule });
  } catch (error) { return next(error); }
};

exports.updateProhibitedRule = async (req, res, next) => {
  try {
    const oldDoc = await ProhibitedRule.findById(req.params.id);
    if (!oldDoc) return res.status(404).json({ success: false, message: 'Rule not found' });
    const rule = await ProhibitedRule.findByIdAndUpdate(req.params.id, req.body || {}, { new: true, runValidators: true });
    await audit(req, 'PROHIBITED_RULE_UPDATE', 'PROHIBITED_RULE', rule._id, '', { old: oldDoc.toObject(), new: rule.toObject() });
    return res.status(200).json({ success: true, data: rule });
  } catch (error) { return next(error); }
};

exports.deleteProhibitedRule = async (req, res, next) => {
  try {
    const rule = await ProhibitedRule.findById(req.params.id);
    if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });
    await ProhibitedRule.deleteOne({ _id: rule._id });
    await audit(req, 'PROHIBITED_RULE_DELETE', 'PROHIBITED_RULE', rule._id, String(req.body?.reason || ''), { deleted: rule.toObject() });
    return res.status(200).json({ success: true, message: 'Deleted' });
  } catch (error) { return next(error); }
};
exports.getAdminVendors = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};
    if (req.query.status) query.vendorStatus = req.query.status;
    if (req.query.verification) query.verificationStatus = req.query.verification;
    if (req.query.q) query.$or = [{ storeName: rx(req.query.q) }, { email: rx(req.query.q) }, { phone: rx(req.query.q) }, { storeSlug: rx(req.query.q) }];

    const [data, total] = await Promise.all([
      Vendor.find(query).populate('user', 'name email role accountStatus isActive isBanned').sort({ createdAt: -1 }).skip(skip).limit(limit),
      Vendor.countDocuments(query)
    ]);
    return paged(res, data, total, page, limit);
  } catch (error) { return next(error); }
};

exports.getAdminVendorById = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.vendorId).populate('user', 'name email role accountStatus isActive isBanned');
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    const documents = await VendorDocument.find({ vendorId: vendor._id }).sort({ uploadedAt: -1 });
    return res.status(200).json({ success: true, data: { ...vendor.toObject(), documents } });
  } catch (error) { return next(error); }
};

async function setVendorAndUserState(vendor, user, vendorStatus, reason, actorId) {
  vendor.vendorStatus = vendorStatus;

  if (vendorStatus === 'ACTIVE') {
    vendor.status = 'approved';
    vendor.accountStatus = 'active';
    vendor.isActive = true;
    vendor.suspensionReason = '';
    vendor.rejectionReason = '';
    if (user) {
      user.accountStatus = 'ACTIVE';
      user.isActive = true;
      user.isBanned = false;
      user.suspensionReason = '';
    }
  }

  if (vendorStatus === 'SUSPENDED') {
    vendor.status = 'suspended';
    vendor.accountStatus = 'suspended';
    vendor.isActive = false;
    vendor.suspensionReason = reason || '';
    vendor.suspendedBy = actorId;
    vendor.suspendedAt = new Date();
    if (user) {
      user.accountStatus = 'SUSPENDED';
      user.isActive = false;
      user.isBanned = false;
      user.suspensionReason = reason || '';
    }
  }

  if (vendorStatus === 'REJECTED') {
    vendor.status = 'rejected';
    vendor.accountStatus = 'suspended';
    vendor.isActive = false;
    vendor.rejectionReason = reason || '';
    if (user) {
      user.accountStatus = 'SUSPENDED';
      user.isActive = false;
      user.isBanned = false;
      user.suspensionReason = reason || '';
    }
  }
}

exports.approveAdminVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    const user = await User.findById(vendor.user);

    const old = { vendorStatus: vendor.vendorStatus, verificationStatus: vendor.verificationStatus };
    await setVendorAndUserState(vendor, user, 'ACTIVE', '', req.user.id);
    vendor.verificationStatus = 'VERIFIED';
    vendor.approvedBy = req.user.id;
    vendor.approvedAt = new Date();

    await Promise.all([vendor.save(), user ? user.save() : Promise.resolve()]);
    await audit(req, 'VENDOR_APPROVE', 'VENDOR', vendor._id, '', { old, new: { vendorStatus: vendor.vendorStatus, verificationStatus: vendor.verificationStatus } });
    return res.status(200).json({ success: true, data: vendor });
  } catch (error) { return next(error); }
};

exports.rejectAdminVendor = async (req, res, next) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'reason is required' });

    const vendor = await Vendor.findById(req.params.vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    const user = await User.findById(vendor.user);

    await setVendorAndUserState(vendor, user, 'REJECTED', reason, req.user.id);
    vendor.verificationStatus = 'UNVERIFIED';

    await Promise.all([vendor.save(), user ? user.save() : Promise.resolve()]);
    await audit(req, 'VENDOR_REJECT', 'VENDOR', vendor._id, reason, { vendorStatus: vendor.vendorStatus });
    return res.status(200).json({ success: true, data: vendor });
  } catch (error) { return next(error); }
};

exports.suspendAdminVendor = async (req, res, next) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'reason is required' });

    const vendor = await Vendor.findById(req.params.vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    const user = await User.findById(vendor.user);

    await setVendorAndUserState(vendor, user, 'SUSPENDED', reason, req.user.id);
    await Promise.all([vendor.save(), user ? user.save() : Promise.resolve()]);
    await audit(req, 'VENDOR_SUSPEND', 'VENDOR', vendor._id, reason, { vendorStatus: vendor.vendorStatus });
    return res.status(200).json({ success: true, data: vendor });
  } catch (error) { return next(error); }
};

exports.unsuspendAdminVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    const user = await User.findById(vendor.user);

    await setVendorAndUserState(vendor, user, 'ACTIVE', '', req.user.id);
    await Promise.all([vendor.save(), user ? user.save() : Promise.resolve()]);
    await audit(req, 'VENDOR_UNSUSPEND', 'VENDOR', vendor._id, '', { vendorStatus: vendor.vendorStatus });
    return res.status(200).json({ success: true, data: vendor });
  } catch (error) { return next(error); }
};

exports.verifyAdminVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    const old = vendor.verificationStatus;
    vendor.verificationStatus = 'VERIFIED';
    await vendor.save();
    await audit(req, 'VENDOR_VERIFY', 'VENDOR', vendor._id, '', { old, new: vendor.verificationStatus });
    return res.status(200).json({ success: true, data: vendor });
  } catch (error) { return next(error); }
};

exports.unverifyAdminVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    const old = vendor.verificationStatus;
    vendor.verificationStatus = 'UNVERIFIED';
    await vendor.save();
    await audit(req, 'VENDOR_UNVERIFY', 'VENDOR', vendor._id, '', { old, new: vendor.verificationStatus });
    return res.status(200).json({ success: true, data: vendor });
  } catch (error) { return next(error); }
};

exports.getAdminVendorDocuments = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = { vendorId: req.params.vendorId };
    if (req.query.status) query.status = req.query.status;

    const [data, total] = await Promise.all([
      VendorDocument.find(query).populate('reviewedBy', 'name email').sort({ uploadedAt: -1 }).skip(skip).limit(limit),
      VendorDocument.countDocuments(query)
    ]);
    return paged(res, data, total, page, limit);
  } catch (error) { return next(error); }
};

exports.approveAdminVendorDocument = async (req, res, next) => {
  try {
    const document = await VendorDocument.findOne({ _id: req.params.docId, vendorId: req.params.vendorId });
    if (!document) return res.status(404).json({ success: false, message: 'Document not found' });

    document.status = 'APPROVED';
    document.reviewedBy = req.user.id;
    document.reviewedAt = new Date();
    document.reviewNote = '';
    await document.save();
    await audit(req, 'DOC_APPROVE', 'DOCUMENT', document._id, '', { vendorId: document.vendorId, status: document.status });
    return res.status(200).json({ success: true, data: document });
  } catch (error) { return next(error); }
};

exports.rejectAdminVendorDocument = async (req, res, next) => {
  try {
    const note = String(req.body?.note || '').trim();
    if (!note) return res.status(400).json({ success: false, message: 'note is required' });

    const document = await VendorDocument.findOne({ _id: req.params.docId, vendorId: req.params.vendorId });
    if (!document) return res.status(404).json({ success: false, message: 'Document not found' });

    document.status = 'REJECTED';
    document.reviewedBy = req.user.id;
    document.reviewedAt = new Date();
    document.reviewNote = note;
    await document.save();
    await audit(req, 'DOC_REJECT', 'DOCUMENT', document._id, note, { vendorId: document.vendorId, status: document.status });
    return res.status(200).json({ success: true, data: document });
  } catch (error) { return next(error); }
};

exports.getAdminUsers = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};
    if (req.query.role) query.role = String(req.query.role).toLowerCase();
    if (req.query.status) query.accountStatus = String(req.query.status).toUpperCase();
    if (req.query.q) query.$or = [{ name: rx(req.query.q) }, { email: rx(req.query.q) }, { phone: rx(req.query.q) }];

    const [data, total] = await Promise.all([
      User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(query)
    ]);
    return paged(res, data, total, page, limit);
  } catch (error) { return next(error); }
};

exports.getAdminUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const vendor = user.role === 'vendor' ? await Vendor.findOne({ user: user._id }) : null;
    return res.status(200).json({ success: true, data: { ...user.toObject(), vendor } });
  } catch (error) { return next(error); }
};

exports.getAdminActivity = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = { ...parseDateRange(req.query) };
    if (req.query.action) query.action = req.query.action;
    if (req.query.role) query.role = req.query.role;
    if (req.query.userId && isObjectId(req.query.userId)) query.userId = req.query.userId;

    const [data, total] = await Promise.all([
      ActivityLog.find(query).populate('userId', 'name email role accountStatus isActive isBanned').sort({ createdAt: -1 }).skip(skip).limit(limit),
      ActivityLog.countDocuments(query)
    ]);
    return paged(res, data, total, page, limit);
  } catch (error) { return next(error); }
};

exports.getAdminAuditLogs = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = { ...parseDateRange(req.query) };
    if (req.query.targetType) query.targetType = req.query.targetType;
    if (req.query.actionType) query.actionType = req.query.actionType;
    if (req.query.actorAdminId && isObjectId(req.query.actorAdminId)) query.actorAdminId = req.query.actorAdminId;

    const [data, total] = await Promise.all([
      AuditLog.find(query).populate('actorAdminId', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit),
      AuditLog.countDocuments(query)
    ]);
    return paged(res, data, total, page, limit);
  } catch (error) { return next(error); }
};
exports.getAdminProducts = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.flagged === 'true' || req.query.flagged === 'false') query.flagged = req.query.flagged === 'true';
    if (req.query.vendorId && isObjectId(req.query.vendorId)) query.vendor = req.query.vendorId;
    if (req.query.q) query.$or = [{ name: rx(req.query.q) }, { title: rx(req.query.q) }, { description: rx(req.query.q) }];

    const [data, total] = await Promise.all([
      Product.find(query)
        .populate('vendor', 'storeName vendorStatus verificationStatus isActive')
        .populate('vendorId', 'name email')
        .populate('category', 'name slug isActive')
        .sort({ submittedForReviewAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Product.countDocuments(query)
    ]);

    return paged(res, data, total, page, limit);
  } catch (error) { return next(error); }
};

exports.getAdminProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.productId)
      .populate('vendor', 'storeName vendorStatus verificationStatus')
      .populate('vendorId', 'name email role')
      .populate('category', 'name slug isActive')
      .populate('publishedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .populate('lastEditedBy', 'name email');

    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    return res.status(200).json({ success: true, data: product });
  } catch (error) { return next(error); }
};

exports.approveAdminProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    product.status = 'PUBLISHED';
    product.isActive = true;
    product.flagged = false;
    product.flagReason = '';
    product.flagSeverity = '';
    product.rejectionReason = '';
    product.publishedBy = req.user.id;
    product.publishedAt = new Date();
    await product.save();

    await audit(req, 'PRODUCT_APPROVE', 'PRODUCT', product._id, '', { status: product.status, isActive: product.isActive });
    return res.status(200).json({ success: true, data: product });
  } catch (error) { return next(error); }
};

exports.rejectAdminProduct = async (req, res, next) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'reason is required' });

    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    product.status = 'REJECTED';
    product.isActive = false;
    product.rejectionReason = reason;
    product.rejectedBy = req.user.id;
    product.rejectedAt = new Date();
    await product.save();

    await audit(req, 'PRODUCT_REJECT', 'PRODUCT', product._id, reason, { status: product.status });
    return res.status(200).json({ success: true, data: product });
  } catch (error) { return next(error); }
};

exports.flagAdminProduct = async (req, res, next) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    const severity = String(req.body?.severity || 'MEDIUM').toUpperCase();
    if (!reason) return res.status(400).json({ success: false, message: 'reason is required' });
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(severity)) return res.status(400).json({ success: false, message: 'Invalid severity' });

    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    product.flagged = true;
    product.flagReason = reason;
    product.flagSeverity = severity;
    product.isActive = false;
    await product.save();

    await audit(req, 'PRODUCT_FLAG', 'PRODUCT', product._id, reason, { severity, flagged: product.flagged, isActive: product.isActive });
    return res.status(200).json({ success: true, data: product });
  } catch (error) { return next(error); }
};

exports.unpublishAdminProduct = async (req, res, next) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'reason is required' });

    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    product.isActive = false;
    await product.save();

    await audit(req, 'PRODUCT_UNPUBLISH', 'PRODUCT', product._id, reason, { isActive: product.isActive });
    return res.status(200).json({ success: true, data: product });
  } catch (error) { return next(error); }
};

exports.republishAdminProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    product.status = 'PUBLISHED';
    product.isActive = true;
    await product.save();

    await audit(req, 'PRODUCT_REPUBLISH', 'PRODUCT', product._id, '', { isActive: product.isActive, status: product.status });
    return res.status(200).json({ success: true, data: product });
  } catch (error) { return next(error); }
};

exports.getAdminProductHistory = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const [data, total] = await Promise.all([
      ProductHistory.find({ productId: req.params.productId }).populate('actorId', 'name email role').sort({ createdAt: -1 }).skip(skip).limit(limit),
      ProductHistory.countDocuments({ productId: req.params.productId })
    ]);
    return paged(res, data, total, page, limit);
  } catch (error) { return next(error); }
};
exports.getAdminOrders = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = { ...parseDateRange(req.query) };
    if (req.query.status) query.$or = [{ status: req.query.status }, { orderStatus: req.query.status }];
    if (req.query.paymentStatus) query.paymentStatus = String(req.query.paymentStatus).toUpperCase();
    if (req.query.vendorId && isObjectId(req.query.vendorId)) query.$and = [...(query.$and || []), { $or: [{ 'items.vendor': req.query.vendorId }, { 'items.vendorId': req.query.vendorId }] }];
    if (req.query.customerId && isObjectId(req.query.customerId)) query.$and = [...(query.$and || []), { $or: [{ customer: req.query.customerId }, { customerId: req.query.customerId }] }];

    if (req.query.q) {
      const q = String(req.query.q).trim();
      const users = await User.find({ $or: [{ name: rx(q) }, { email: rx(q) }] }).select('_id');
      query.$and = [...(query.$and || []), {
        $or: [
          { orderNumber: rx(q) },
          ...(isObjectId(q) ? [{ _id: q }] : []),
          { customer: { $in: users.map((u) => u._id) } },
          { customerId: { $in: users.map((u) => u._id) } }
        ]
      }];
    }

    const [data, total] = await Promise.all([
      Order.find(query)
        .populate('customer', 'name email')
        .populate('customerId', 'name email')
        .populate('items.vendor', 'storeName')
        .populate('items.vendorId', 'storeName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(query)
    ]);

    return paged(res, data, total, page, limit);
  } catch (error) { return next(error); }
};

exports.getAdminOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate('customer', 'name email phone')
      .populate('customerId', 'name email phone')
      .populate('items.product', 'name title slug')
      .populate('items.productId', 'name title slug')
      .populate('items.vendor', 'storeName')
      .populate('items.vendorId', 'storeName');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    return res.status(200).json({ success: true, data: order });
  } catch (error) { return next(error); }
};

exports.cancelAdminOrder = async (req, res, next) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'reason is required' });

    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.status = 'cancelled';
    order.orderStatus = 'CANCELLED';
    order.cancellationReason = reason;
    order.cancelledAt = new Date();
    await order.save();

    await audit(req, 'ORDER_CANCEL', 'ORDER', order._id, reason, { status: order.status, orderStatus: order.orderStatus });
    return res.status(200).json({ success: true, data: order });
  } catch (error) { return next(error); }
};

exports.markOrderChargeback = async (req, res, next) => {
  try {
    const status = String(req.body?.status || 'CHARGEBACK_OPEN').toUpperCase();
    const notes = String(req.body?.notes || '').trim();
    if (!['CHARGEBACK_OPEN', 'CHARGEBACK_RESOLVED'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });

    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.chargebackStatus = status;
    order.chargebackNotes = notes;
    await order.save();

    await audit(req, status === 'CHARGEBACK_OPEN' ? 'ORDER_CHARGEBACK_OPEN' : 'ORDER_CHARGEBACK_RESOLVE', 'ORDER', order._id, notes, { chargebackStatus: order.chargebackStatus });
    return res.status(200).json({ success: true, data: order });
  } catch (error) { return next(error); }
};

exports.getAdminRefunds = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = { ...parseDateRange(req.query) };
    if (req.query.status) query.status = req.query.status;
    if (req.query.q) query.$or = [{ reviewNote: rx(req.query.q) }, ...(isObjectId(req.query.q) ? [{ _id: req.query.q }, { orderId: req.query.q }, { customerId: req.query.q }] : [])];

    const [data, total] = await Promise.all([
      RefundRequest.find(query).populate('orderId', 'orderNumber status paymentStatus total').populate('customerId', 'name email').populate('reviewedBy', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit),
      RefundRequest.countDocuments(query)
    ]);
    return paged(res, data, total, page, limit);
  } catch (error) { return next(error); }
};

exports.approveAdminRefund = async (req, res, next) => {
  try {
    const refund = await RefundRequest.findById(req.params.id);
    if (!refund) return res.status(404).json({ success: false, message: 'Refund request not found' });

    const note = String(req.body?.note || '').trim();
    refund.status = 'APPROVED';
    refund.reviewedBy = req.user.id;
    refund.reviewNote = note;
    await refund.save();

    await audit(req, 'REFUND_APPROVE', 'REFUND', refund._id, note, { status: refund.status });
    return res.status(200).json({ success: true, data: refund });
  } catch (error) { return next(error); }
};

exports.rejectAdminRefund = async (req, res, next) => {
  try {
    const note = String(req.body?.note || '').trim();
    if (!note) return res.status(400).json({ success: false, message: 'note is required' });

    const refund = await RefundRequest.findById(req.params.id);
    if (!refund) return res.status(404).json({ success: false, message: 'Refund request not found' });

    refund.status = 'REJECTED';
    refund.reviewedBy = req.user.id;
    refund.reviewNote = note;
    await refund.save();

    await audit(req, 'REFUND_REJECT', 'REFUND', refund._id, note, { status: refund.status });
    return res.status(200).json({ success: true, data: refund });
  } catch (error) { return next(error); }
};

exports.markAdminRefunded = async (req, res, next) => {
  try {
    const note = String(req.body?.note || '').trim();
    const refund = await RefundRequest.findById(req.params.id);
    if (!refund) return res.status(404).json({ success: false, message: 'Refund request not found' });

    refund.status = 'REFUNDED';
    refund.reviewedBy = req.user.id;
    refund.reviewNote = note;
    await refund.save();

    await audit(req, 'REFUND_MARK_REFUNDED', 'REFUND', refund._id, note, { status: refund.status });
    return res.status(200).json({ success: true, data: refund });
  } catch (error) { return next(error); }
};
function normalizeDisputeStatus(status) {
  const value = String(status || '').toUpperCase();
  return ['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED'].includes(value) ? value : null;
}

exports.getAdminDisputes = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = { ...parseDateRange(req.query) };
    if (req.query.status) {
      const status = normalizeDisputeStatus(req.query.status);
      if (status) query.status = { $in: [status, status.toLowerCase().replace('_', '-')] };
    }

    if (req.query.q) {
      const orderMatches = await Order.find({ orderNumber: rx(req.query.q) }).select('_id');
      query.$or = [{ reason: rx(req.query.q) }, { description: rx(req.query.q) }, ...(isObjectId(req.query.q) ? [{ _id: req.query.q }, { order: req.query.q }] : []), { order: { $in: orderMatches.map((o) => o._id) } }];
    }

    const [data, total] = await Promise.all([
      Dispute.find(query).populate('order', 'orderNumber status paymentStatus').populate('customer', 'name email').populate('vendor', 'storeName').sort({ createdAt: -1 }).skip(skip).limit(limit),
      Dispute.countDocuments(query)
    ]);
    return paged(res, data, total, page, limit);
  } catch (error) { return next(error); }
};

exports.getAdminDisputeById = async (req, res, next) => {
  try {
    const dispute = await Dispute.findById(req.params.id).populate('order', 'orderNumber status paymentStatus').populate('customer', 'name email').populate('vendor', 'storeName').populate('messages.sender', 'name email role');
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });
    return res.status(200).json({ success: true, data: dispute });
  } catch (error) { return next(error); }
};

exports.addAdminDisputeMessage = async (req, res, next) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'message is required' });

    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });

    dispute.messages = dispute.messages || [];
    dispute.messages.push({ sender: req.user.id, senderRole: 'ADMIN', message, attachments: [], createdAt: new Date() });
    await dispute.save();

    await audit(req, 'DISPUTE_MESSAGE_ADD', 'DISPUTE', dispute._id, message, { messageLength: message.length });
    return res.status(201).json({ success: true, data: dispute.messages[dispute.messages.length - 1] });
  } catch (error) { return next(error); }
};

exports.updateAdminDisputeStatus = async (req, res, next) => {
  try {
    const status = normalizeDisputeStatus(req.body?.status);
    if (!status) return res.status(400).json({ success: false, message: 'Invalid status' });

    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });

    dispute.status = status;
    if (status === 'RESOLVED' || status === 'CLOSED') {
      dispute.resolvedBy = req.user.id;
      dispute.resolvedAt = new Date();
      dispute.resolution = String(req.body?.resolution || dispute.resolution || '');
    }
    await dispute.save();

    await audit(req, 'DISPUTE_STATUS_UPDATE', 'DISPUTE', dispute._id, String(req.body?.resolution || ''), { status: dispute.status });
    return res.status(200).json({ success: true, data: dispute });
  } catch (error) { return next(error); }
};

exports.createAdminFraudFlag = async (req, res, next) => {
  try {
    const level = String(req.body?.level || '').toUpperCase();
    const reason = String(req.body?.reason || '').trim();
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(level) || !reason) return res.status(400).json({ success: false, message: 'level and reason are required' });

    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const flag = await FraudFlag.create({ orderId: order._id, level, reason, status: 'OPEN', createdBy: req.user.id });
    await audit(req, 'FRAUD_FLAG_CREATE', 'FRAUD_FLAG', flag._id, reason, { orderId: order._id, level });
    return res.status(201).json({ success: true, data: flag });
  } catch (error) { return next(error); }
};

exports.resolveAdminFraudFlag = async (req, res, next) => {
  try {
    const note = String(req.body?.note || '').trim();
    const flag = await FraudFlag.findById(req.params.id);
    if (!flag) return res.status(404).json({ success: false, message: 'Fraud flag not found' });

    flag.status = 'RESOLVED';
    flag.resolvedBy = req.user.id;
    flag.resolvedAt = new Date();
    flag.note = note;
    await flag.save();

    await audit(req, 'FRAUD_FLAG_RESOLVE', 'FRAUD_FLAG', flag._id, note, { status: flag.status });
    return res.status(200).json({ success: true, data: flag });
  } catch (error) { return next(error); }
};

exports.getAdminReports = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = { ...parseDateRange(req.query) };
    if (req.query.status) query.status = req.query.status;
    if (req.query.targetType) query.targetType = req.query.targetType;
    if (req.query.q) query.$or = [{ reason: rx(req.query.q) }, ...(isObjectId(req.query.q) ? [{ _id: req.query.q }, { targetId: req.query.q }, { reporterId: req.query.q }] : [])];

    const [data, total] = await Promise.all([
      Report.find(query).populate('reporterId', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit),
      Report.countDocuments(query)
    ]);
    return paged(res, data, total, page, limit);
  } catch (error) { return next(error); }
};

exports.updateAdminReportStatus = async (req, res, next) => {
  try {
    const status = String(req.body?.status || '').toUpperCase();
    if (!['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });

    const report = await Report.findById(req.params.reportId);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    report.status = status;
    await report.save();
    await audit(req, 'REPORT_STATUS_UPDATE', 'REPORT', report._id, String(req.body?.reason || ''), { status: report.status });
    return res.status(200).json({ success: true, data: report });
  } catch (error) { return next(error); }
};
exports.getCMSPages = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.audience) query.audience = req.query.audience;
    if (req.query.q) query.$or = [{ title: rx(req.query.q) }, { slug: rx(req.query.q) }];

    const [data, total] = await Promise.all([
      CMSPage.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit),
      CMSPage.countDocuments(query)
    ]);
    return paged(res, data, total, page, limit);
  } catch (error) { return next(error); }
};

exports.createCMSPage = async (req, res, next) => {
  try {
    const pageDoc = await CMSPage.create(req.body || {});
    await audit(req, 'CMS_PAGE_CREATE', 'CMS_PAGE', pageDoc._id, '', { new: pageDoc.toObject() });
    return res.status(201).json({ success: true, data: pageDoc });
  } catch (error) { return next(error); }
};

exports.updateCMSPage = async (req, res, next) => {
  try {
    const oldDoc = await CMSPage.findById(req.params.id);
    if (!oldDoc) return res.status(404).json({ success: false, message: 'Page not found' });

    const pageDoc = await CMSPage.findByIdAndUpdate(req.params.id, req.body || {}, { new: true, runValidators: true });
    await audit(req, 'CMS_PAGE_UPDATE', 'CMS_PAGE', pageDoc._id, '', { old: oldDoc.toObject(), new: pageDoc.toObject() });
    return res.status(200).json({ success: true, data: pageDoc });
  } catch (error) { return next(error); }
};

exports.deleteCMSPage = async (req, res, next) => {
  try {
    const pageDoc = await CMSPage.findById(req.params.id);
    if (!pageDoc) return res.status(404).json({ success: false, message: 'Page not found' });
    await CMSPage.deleteOne({ _id: pageDoc._id });
    await audit(req, 'CMS_PAGE_DELETE', 'CMS_PAGE', pageDoc._id, String(req.body?.reason || ''), { deleted: pageDoc.toObject() });
    return res.status(200).json({ success: true, message: 'Deleted' });
  } catch (error) { return next(error); }
};

exports.publishCMSPage = async (req, res, next) => {
  try {
    const pageDoc = await CMSPage.findById(req.params.id);
    if (!pageDoc) return res.status(404).json({ success: false, message: 'Page not found' });
    pageDoc.status = 'PUBLISHED';
    pageDoc.publishedAt = new Date();
    await pageDoc.save();
    await audit(req, 'CMS_PAGE_PUBLISH', 'CMS_PAGE', pageDoc._id, '', { status: pageDoc.status });
    return res.status(200).json({ success: true, data: pageDoc });
  } catch (error) { return next(error); }
};

exports.unpublishCMSPage = async (req, res, next) => {
  try {
    const pageDoc = await CMSPage.findById(req.params.id);
    if (!pageDoc) return res.status(404).json({ success: false, message: 'Page not found' });
    pageDoc.status = 'DRAFT';
    await pageDoc.save();
    await audit(req, 'CMS_PAGE_UNPUBLISH', 'CMS_PAGE', pageDoc._id, '', { status: pageDoc.status });
    return res.status(200).json({ success: true, data: pageDoc });
  } catch (error) { return next(error); }
};

exports.getBanners = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};
    if (req.query.placement) query.placement = req.query.placement;
    if (req.query.active === 'true' || req.query.active === 'false') query.isActive = req.query.active === 'true';
    if (req.query.q) query.title = rx(req.query.q);

    const [data, total] = await Promise.all([
      Banner.find(query).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit),
      Banner.countDocuments(query)
    ]);
    return paged(res, data, total, page, limit);
  } catch (error) { return next(error); }
};

exports.createBanner = async (req, res, next) => {
  try {
    const banner = await Banner.create(req.body || {});
    await audit(req, 'BANNER_CREATE', 'BANNER', banner._id, '', { new: banner.toObject() });
    return res.status(201).json({ success: true, data: banner });
  } catch (error) { return next(error); }
};

exports.updateBanner = async (req, res, next) => {
  try {
    const oldDoc = await Banner.findById(req.params.id);
    if (!oldDoc) return res.status(404).json({ success: false, message: 'Banner not found' });
    const banner = await Banner.findByIdAndUpdate(req.params.id, req.body || {}, { new: true, runValidators: true });
    await audit(req, 'BANNER_UPDATE', 'BANNER', banner._id, '', { old: oldDoc.toObject(), new: banner.toObject() });
    return res.status(200).json({ success: true, data: banner });
  } catch (error) { return next(error); }
};

exports.deleteBanner = async (req, res, next) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) return res.status(404).json({ success: false, message: 'Banner not found' });
    await Banner.deleteOne({ _id: banner._id });
    await audit(req, 'BANNER_DELETE', 'BANNER', banner._id, String(req.body?.reason || ''), { deleted: banner.toObject() });
    return res.status(200).json({ success: true, message: 'Deleted' });
  } catch (error) { return next(error); }
};
exports.getHomepageSections = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};
    if (req.query.key) query.key = req.query.key;
    if (req.query.active === 'true' || req.query.active === 'false') query.isActive = req.query.active === 'true';

    const [data, total] = await Promise.all([
      HomepageSection.find(query).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit),
      HomepageSection.countDocuments(query)
    ]);
    return paged(res, data, total, page, limit);
  } catch (error) { return next(error); }
};

exports.createHomepageSection = async (req, res, next) => {
  try {
    const section = await HomepageSection.create(req.body || {});
    await audit(req, 'HOMEPAGE_SECTION_CREATE', 'HOMEPAGE_SECTION', section._id, '', { new: section.toObject() });
    return res.status(201).json({ success: true, data: section });
  } catch (error) { return next(error); }
};

exports.updateHomepageSection = async (req, res, next) => {
  try {
    const oldDoc = await HomepageSection.findById(req.params.id);
    if (!oldDoc) return res.status(404).json({ success: false, message: 'Section not found' });
    const section = await HomepageSection.findByIdAndUpdate(req.params.id, req.body || {}, { new: true, runValidators: true });
    await audit(req, 'HOMEPAGE_SECTION_UPDATE', 'HOMEPAGE_SECTION', section._id, '', { old: oldDoc.toObject(), new: section.toObject() });
    return res.status(200).json({ success: true, data: section });
  } catch (error) { return next(error); }
};

exports.deleteHomepageSection = async (req, res, next) => {
  try {
    const section = await HomepageSection.findById(req.params.id);
    if (!section) return res.status(404).json({ success: false, message: 'Section not found' });
    await HomepageSection.deleteOne({ _id: section._id });
    await audit(req, 'HOMEPAGE_SECTION_DELETE', 'HOMEPAGE_SECTION', section._id, String(req.body?.reason || ''), { deleted: section.toObject() });
    return res.status(200).json({ success: true, message: 'Deleted' });
  } catch (error) { return next(error); }
};

exports.reorderHomepageSections = async (req, res, next) => {
  try {
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : [];
    if (!orderedIds.length) return res.status(400).json({ success: false, message: 'orderedIds is required' });

    const ops = orderedIds.filter(isObjectId).map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { $set: { sortOrder: index } } }
    }));
    if (!ops.length) return res.status(400).json({ success: false, message: 'No valid section ids' });

    await HomepageSection.bulkWrite(ops);
    await audit(req, 'HOMEPAGE_SECTION_REORDER', 'HOMEPAGE_SECTION', null, '', { orderedIds });
    return res.status(200).json({ success: true, message: 'Reordered' });
  } catch (error) { return next(error); }
};

exports.getAdminAnalyticsOverview = async (req, res, next) => {
  try {
    const range = String(req.query.range || '30d').toLowerCase();
    const now = new Date();

    let from = null;
    let to = now;
    if (req.query.from || req.query.to) {
      const parsedFrom = req.query.from ? new Date(req.query.from) : null;
      const parsedTo = req.query.to ? new Date(req.query.to) : now;
      if (parsedFrom && !Number.isNaN(parsedFrom.getTime())) from = parsedFrom;
      if (parsedTo && !Number.isNaN(parsedTo.getTime())) to = parsedTo;
    } else {
      const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
      from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }

    const orderMatch = {
      paymentStatus: { $in: ['PAID', 'paid'] },
      ...(from || to ? { createdAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {})
    };

    const [summaryAgg, gmvByDay, topVendors, topCategories, topProducts, refundsCount] = await Promise.all([
      Order.aggregate([{ $match: orderMatch }, { $group: { _id: null, gmvTotal: { $sum: { $ifNull: ['$total', 0] } }, orderCount: { $sum: 1 } } }]),
      Order.aggregate([{ $match: orderMatch }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: { $ifNull: ['$total', 0] } } } }, { $sort: { _id: 1 } }]),
      Order.aggregate([{ $match: orderMatch }, { $unwind: '$items' }, { $group: { _id: { $ifNull: ['$items.vendorId', '$items.vendor'] }, revenue: { $sum: { $ifNull: ['$items.subtotal', 0] } }, units: { $sum: { $ifNull: ['$items.qty', '$items.quantity'] } }, orderIds: { $addToSet: '$_id' } } }, { $lookup: { from: 'vendors', localField: '_id', foreignField: '_id', as: 'vendor' } }, { $unwind: { path: '$vendor', preserveNullAndEmptyArrays: true } }, { $project: { vendorId: '$_id', storeName: { $ifNull: ['$vendor.storeName', 'Unknown Vendor'] }, revenue: 1, units: 1, orders: { $size: '$orderIds' } } }, { $sort: { revenue: -1 } }, { $limit: 10 }]),
      Order.aggregate([{ $match: orderMatch }, { $unwind: '$items' }, { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'product' } }, { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } }, { $group: { _id: '$product.category', revenue: { $sum: { $ifNull: ['$items.subtotal', 0] } }, units: { $sum: { $ifNull: ['$items.qty', '$items.quantity'] } }, orderIds: { $addToSet: '$_id' } } }, { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } }, { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } }, { $project: { categoryId: '$_id', name: { $ifNull: ['$category.name', 'Uncategorized'] }, revenue: 1, units: 1, orders: { $size: '$orderIds' } } }, { $sort: { revenue: -1 } }, { $limit: 10 }]),
      Order.aggregate([{ $match: orderMatch }, { $unwind: '$items' }, { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'product' } }, { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } }, { $group: { _id: '$items.productId', title: { $first: { $ifNull: ['$product.name', '$items.name'] } }, revenue: { $sum: { $ifNull: ['$items.subtotal', 0] } }, units: { $sum: { $ifNull: ['$items.qty', '$items.quantity'] } } } }, { $sort: { revenue: -1 } }, { $limit: 10 }, { $project: { productId: '$_id', title: 1, revenue: 1, units: 1 } }]),
      RefundRequest.countDocuments(from || to ? { createdAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {})
    ]);

    const gmvTotal = summaryAgg[0]?.gmvTotal || 0;
    const orderCount = summaryAgg[0]?.orderCount || 0;

    return res.status(200).json({
      success: true,
      data: {
        gmvTotal,
        gmvByDay: gmvByDay.map((r) => ({ date: r._id, total: r.total })),
        orderCount,
        paidOrderCount: orderCount,
        avgOrderValue: orderCount ? gmvTotal / orderCount : 0,
        revenue: gmvTotal,
        topVendors,
        topCategories,
        topProducts,
        refundsCount
      }
    });
  } catch (error) { return next(error); }
};

exports.getPublicCMSPageBySlug = async (req, res, next) => {
  try {
    const pageDoc = await CMSPage.findOne({ slug: req.params.slug, status: 'PUBLISHED' });
    if (!pageDoc) return res.status(404).json({ success: false, message: 'Page not found' });
    return res.status(200).json({ success: true, data: pageDoc });
  } catch (error) { return next(error); }
};

exports.getPublicHomepageContent = async (_req, res, next) => {
  try {
    const now = new Date();
    const [banners, sections] = await Promise.all([
      Banner.find({ isActive: true, $and: [{ $or: [{ startAt: null }, { startAt: { $lte: now } }] }, { $or: [{ endAt: null }, { endAt: { $gte: now } }] }] }).sort({ sortOrder: 1 }),
      HomepageSection.find({ isActive: true }).sort({ sortOrder: 1 })
    ]);
    return res.status(200).json({ success: true, data: { banners, sections } });
  } catch (error) { return next(error); }
};
exports.updateAdminUserRole = async (req, res, next) => {
  try {
    const role = String(req.body?.role || '').toLowerCase();
    if (!['admin', 'vendor', 'customer'].includes(role)) return res.status(400).json({ success: false, message: 'Invalid role' });

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const old = user.role;
    user.role = role;
    await user.save();

    await audit(req, 'USER_ROLE_CHANGE', 'USER', user._id, '', { old, new: user.role });
    return res.status(200).json({ success: true, data: user });
  } catch (error) { return next(error); }
};

exports.suspendAdminUser = async (req, res, next) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'reason is required' });

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.accountStatus = 'SUSPENDED';
    user.suspensionReason = reason;
    await user.save();

    await audit(req, 'USER_SUSPEND', 'USER', user._id, reason, { accountStatus: user.accountStatus });
    return res.status(200).json({ success: true, data: user });
  } catch (error) { return next(error); }
};

exports.unsuspendAdminUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.accountStatus = 'ACTIVE';
    user.suspensionReason = '';
    await user.save();

    await audit(req, 'USER_UNSUSPEND', 'USER', user._id, '', { accountStatus: user.accountStatus });
    return res.status(200).json({ success: true, data: user });
  } catch (error) { return next(error); }
};

exports.banAdminUser = async (req, res, next) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'reason is required' });

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.accountStatus = 'BANNED';
    user.banReason = reason;
    await user.save();

    await audit(req, 'USER_BAN', 'USER', user._id, reason, { accountStatus: user.accountStatus });
    return res.status(200).json({ success: true, data: user });
  } catch (error) { return next(error); }
};

exports.unbanAdminUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.accountStatus = 'ACTIVE';
    user.banReason = '';
    await user.save();

    await audit(req, 'USER_UNBAN', 'USER', user._id, '', { accountStatus: user.accountStatus });
    return res.status(200).json({ success: true, data: user });
  } catch (error) { return next(error); }
};

exports.editAdminUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const old = { name: user.name, email: user.email, phone: user.phone };
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) user.name = req.body.name;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'phone')) user.phone = req.body.phone;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'email')) {
      const email = String(req.body.email || '').trim().toLowerCase();
      const exists = await User.findOne({ email, _id: { $ne: user._id } }).select('_id');
      if (exists) return res.status(400).json({ success: false, message: 'Email already in use' });
      user.email = email;
    }

    await user.save();
    await audit(req, 'ADMIN_EDIT_USER', 'USER', user._id, String(req.body?.reason || ''), { old, new: { name: user.name, email: user.email, phone: user.phone } });
    return res.status(200).json({ success: true, data: user });
  } catch (error) { return next(error); }
};
