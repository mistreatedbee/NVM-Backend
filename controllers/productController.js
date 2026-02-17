const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const ProductHistory = require('../models/ProductHistory');
const AuditLog = require('../models/AuditLog');
const { notifyAdmins, notifyUser } = require('../services/notificationService');

const PRODUCT_STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  PUBLISHED: 'PUBLISHED',
  REJECTED: 'REJECTED'
};

const VENDOR_CAN_UNPUBLISH = String(process.env.VENDOR_CAN_UNPUBLISH || 'false').toLowerCase() === 'true';
const VENDOR_CAN_REPUBLISH = String(process.env.VENDOR_CAN_REPUBLISH || 'false').toLowerCase() === 'true';

const VENDOR_EDITABLE_FIELDS = [
  'name', 'description', 'shortDescription', 'productType', 'category', 'subcategory', 'tags',
  'price', 'compareAtPrice', 'costPrice', 'sku', 'stock', 'trackInventory', 'lowStockThreshold',
  'variants', 'images', 'digitalFile', 'serviceDetails', 'shipping', 'seo'
];

const VENDOR_EDITABLE_WHEN_PUBLISHED = ['description', 'shortDescription', 'tags', 'images', 'seo'];

const FORBIDDEN_VENDOR_FIELDS = new Set([
  'status', 'isActive', 'submittedForReviewAt', 'publishedAt', 'publishedBy', 'rejectedAt',
  'rejectedBy', 'rejectionReason', 'lastEditedAt', 'lastEditedBy', 'vendor', 'vendorId'
]);

const PUBLIC_PRODUCT_QUERY = { status: PRODUCT_STATUS.PUBLISHED, isActive: true };

function actorRoleFromUser(user) {
  return user?.role === 'admin' ? 'ADMIN' : 'VENDOR';
}

function buildDiff(previousDoc, updates) {
  const changes = {};
  Object.keys(updates || {}).forEach((key) => {
    const nextValue = updates[key];
    const prevValue = previousDoc?.[key];
    if (JSON.stringify(prevValue) !== JSON.stringify(nextValue)) {
      changes[key] = { from: prevValue, to: nextValue };
    }
  });
  return changes;
}

async function createHistory({ productId, actorId, actorRole, action, previousStatus, newStatus, changes, note }) {
  await ProductHistory.create({ productId, actorId, actorRole, action, previousStatus, newStatus, changes, note });
}

async function createProductAuditLog({ req, actionType, productId, metadata }) {
  await AuditLog.create({
    actorAdminId: req.user.id,
    actorId: req.user.id,
    actorRole: 'Admin',
    actionType,
    action: actionType,
    targetProductId: productId,
    entityType: 'Product',
    entityId: productId,
    metadata
  });
}

async function findVendorForUser(userId) {
  return Vendor.findOne({ user: userId });
}

async function canVendorAccessProduct(product, userId) {
  if (!product) return false;
  if (product.vendorId && product.vendorId.toString() === String(userId)) return true;
  const vendor = await Vendor.findById(product.vendor).select('user');
  return Boolean(vendor && String(vendor.user) === String(userId));
}

function applyVendorUpdates(product, payload) {
  const previous = product.toObject();
  const updates = {};
  const allowedFields = product.status === PRODUCT_STATUS.PUBLISHED ? VENDOR_EDITABLE_WHEN_PUBLISHED : VENDOR_EDITABLE_FIELDS;

  Object.keys(payload || {}).forEach((field) => {
    if (!allowedFields.includes(field) || FORBIDDEN_VENDOR_FIELDS.has(field)) return;
    updates[field] = payload[field];
    product[field] = payload[field];
  });

  return { updates, diff: buildDiff(previous, updates) };
}

async function populateProduct(product) {
  if (!product) return null;
  return Product.findById(product._id)
    .populate('vendor', 'storeName slug logo rating user')
    .populate('vendorId', 'name email role')
    .populate('category', 'name slug')
    .populate('publishedBy', 'name email')
    .populate('rejectedBy', 'name email')
    .populate('lastEditedBy', 'name email');
}

exports.createProduct = async (req, res, next) => {
  try {
    const vendor = await findVendorForUser(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor profile not found' });

    if (vendor.status !== 'approved' || vendor.accountStatus !== 'active') {
      return res.status(403).json({ success: false, message: 'Vendor must be approved and active to create products' });
    }

    const activeProductCount = await Product.countDocuments({ vendor: vendor._id, isActive: true });
    if (activeProductCount >= 2) {
      return res.status(403).json({ success: false, message: 'Product limit reached: you can only add 2 products at the moment' });
    }

    const payload = { ...req.body };
    FORBIDDEN_VENDOR_FIELDS.forEach((field) => delete payload[field]);

    const product = await Product.create({
      ...payload,
      vendor: vendor._id,
      vendorId: req.user.id,
      status: PRODUCT_STATUS.DRAFT,
      isActive: true,
      lastEditedAt: new Date(),
      lastEditedBy: req.user.id
    });

    await createHistory({
      productId: product._id,
      actorId: req.user.id,
      actorRole: actorRoleFromUser(req.user),
      action: 'CREATE',
      previousStatus: null,
      newStatus: product.status,
      changes: { createdFields: Object.keys(payload || {}) }
    });

    vendor.totalProducts += 1;
    await vendor.save();

    const populated = await populateProduct(product);
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

exports.getMyProducts = async (req, res, next) => {
  try {
    const vendor = await findVendorForUser(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor profile not found' });

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const query = { vendor: vendor._id };

    if (req.query.status && req.query.status !== 'all') query.status = req.query.status;
    if (req.query.isActive === 'true' || req.query.isActive === 'false') query.isActive = req.query.isActive === 'true';
    if (req.query.q) {
      query.$or = [
        { name: { $regex: req.query.q, $options: 'i' } },
        { description: { $regex: req.query.q, $options: 'i' } }
      ];
    }

    const [products, total] = await Promise.all([
      Product.find(query).populate('category', 'name slug').sort('-updatedAt').skip(skip).limit(limit),
      Product.countDocuments(query)
    ]);

    res.status(200).json({ success: true, count: products.length, total, pages: Math.ceil(total / limit), currentPage: page, data: products });
  } catch (error) {
    next(error);
  }
};
exports.getVendorProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.productId)
      .populate('category', 'name slug')
      .populate('vendor', 'storeName slug user')
      .populate('vendorId', 'name email');

    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const isOwner = await canVendorAccessProduct(product, req.user.id);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to view this product' });
    }

    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

exports.getAdminProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const query = {};

    if (req.query.status && req.query.status !== 'all') query.status = req.query.status;
    if (req.query.vendorId) query.vendorId = req.query.vendorId;

    if (req.query.q) {
      const term = String(req.query.q).trim();
      const matchingVendors = await Vendor.find({ storeName: { $regex: term, $options: 'i' } }).select('_id');
      query.$or = [
        { name: { $regex: term, $options: 'i' } },
        { description: { $regex: term, $options: 'i' } },
        { vendor: { $in: matchingVendors.map((v) => v._id) } }
      ];
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('vendor', 'storeName slug logo user')
        .populate('vendorId', 'name email')
        .populate('category', 'name slug')
        .populate('publishedBy', 'name email')
        .populate('rejectedBy', 'name email')
        .sort('-submittedForReviewAt -createdAt')
        .skip(skip)
        .limit(limit),
      Product.countDocuments(query)
    ]);

    res.status(200).json({ success: true, count: products.length, total, pages: Math.ceil(total / limit), currentPage: page, data: products });
  } catch (error) {
    next(error);
  }
};

exports.getAdminProductById = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const product = await Product.findById(req.params.productId)
      .populate('vendor', 'storeName slug logo user rating totalReviews totalSales')
      .populate('vendorId', 'name email role')
      .populate('category', 'name slug')
      .populate('publishedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .populate('lastEditedBy', 'name email');

    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const [history, totalHistory] = await Promise.all([
      ProductHistory.find({ productId: product._id }).populate('actorId', 'name email role').sort('-createdAt').skip(skip).limit(limit),
      ProductHistory.countDocuments({ productId: product._id })
    ]);

    res.status(200).json({
      success: true,
      data: {
        product,
        history,
        historyPagination: { total: totalHistory, page, limit, pages: Math.ceil(totalHistory / limit) }
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getAllProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;
    const skip = (page - 1) * limit;
    const query = { ...PUBLIC_PRODUCT_QUERY };

    if (req.query.category) query.category = req.query.category;
    if (req.query.vendor) query.vendor = req.query.vendor;
    if (req.query.type) query.productType = req.query.type;
    if (req.query.minPrice || req.query.maxPrice) {
      query.price = {};
      if (req.query.minPrice) query.price.$gte = parseFloat(req.query.minPrice);
      if (req.query.maxPrice) query.price.$lte = parseFloat(req.query.maxPrice);
    }
    if (req.query.search) query.$text = { $search: req.query.search };

    let sort = '-createdAt';
    if (req.query.sort === 'price-asc') sort = 'price';
    else if (req.query.sort === 'price-desc') sort = '-price';
    else if (req.query.sort === 'rating') sort = '-rating';
    else if (req.query.sort === 'popular') sort = '-totalSales';

    const [products, total] = await Promise.all([
      Product.find(query).populate('vendor', 'storeName slug logo rating').populate('category', 'name slug').sort(sort).skip(skip).limit(limit),
      Product.countDocuments(query)
    ]);

    res.status(200).json({ success: true, count: products.length, total, pages: Math.ceil(total / limit), currentPage: page, data: products });
  } catch (error) {
    next(error);
  }
};

exports.getProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).populate('vendor', 'storeName slug logo rating totalReviews').populate('category', 'name slug');
    if (!product || product.status !== PRODUCT_STATUS.PUBLISHED || !product.isActive) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    product.views += 1;
    await product.save({ validateBeforeSave: false });
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

exports.getProductBySlug = async (req, res, next) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug }).populate('vendor', 'storeName slug logo rating totalReviews').populate('category', 'name slug');
    if (!product || product.status !== PRODUCT_STATUS.PUBLISHED || !product.isActive) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    product.views += 1;
    await product.save({ validateBeforeSave: false });
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

exports.updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.productId || req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const isOwner = await canVendorAccessProduct(product, req.user.id);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to update this product' });
    }

    if (req.user.role !== 'admin') {
      if (product.status === PRODUCT_STATUS.PENDING) {
        return res.status(400).json({ success: false, message: 'Cannot edit a product while pending review' });
      }
      if (![PRODUCT_STATUS.DRAFT, PRODUCT_STATUS.REJECTED, PRODUCT_STATUS.PUBLISHED].includes(product.status)) {
        return res.status(400).json({ success: false, message: 'This product cannot be edited in its current state' });
      }

      const { diff } = applyVendorUpdates(product, req.body || {});
      if (Object.keys(diff).length === 0) {
        return res.status(400).json({ success: false, message: 'No allowed fields to update' });
      }

      product.lastEditedAt = new Date();
      product.lastEditedBy = req.user.id;
      await product.save();

      await createHistory({
        productId: product._id,
        actorId: req.user.id,
        actorRole: actorRoleFromUser(req.user),
        action: 'UPDATE',
        previousStatus: product.status,
        newStatus: product.status,
        changes: diff
      });

      const populated = await populateProduct(product);
      return res.status(200).json({ success: true, data: populated });
    }

    Object.keys(req.body || {}).forEach((field) => {
      if (field === 'vendor' || field === 'vendorId') return;
      product[field] = req.body[field];
    });

    product.lastEditedAt = new Date();
    product.lastEditedBy = req.user.id;
    await product.save();

    await createHistory({
      productId: product._id,
      actorId: req.user.id,
      actorRole: 'ADMIN',
      action: 'UPDATE',
      previousStatus: product.status,
      newStatus: product.status,
      changes: { adminUpdatedFields: Object.keys(req.body || {}) }
    });

    const populated = await populateProduct(product);
    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};
exports.submitProductForReview = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const isOwner = await canVendorAccessProduct(product, req.user.id);
    if (!isOwner) return res.status(403).json({ success: false, message: 'Not authorized to submit this product' });

    if (![PRODUCT_STATUS.DRAFT, PRODUCT_STATUS.REJECTED].includes(product.status)) {
      return res.status(400).json({ success: false, message: 'Only DRAFT or REJECTED products can be submitted for review' });
    }

    const previousStatus = product.status;
    product.status = PRODUCT_STATUS.PENDING;
    product.submittedForReviewAt = new Date();
    product.rejectedAt = undefined;
    product.rejectedBy = undefined;
    product.rejectionReason = '';
    product.lastEditedAt = new Date();
    product.lastEditedBy = req.user.id;
    await product.save();

    await createHistory({
      productId: product._id,
      actorId: req.user.id,
      actorRole: 'VENDOR',
      action: 'SUBMIT',
      previousStatus,
      newStatus: product.status,
      changes: { submittedForReviewAt: product.submittedForReviewAt }
    });

    const vendor = await Vendor.findById(product.vendor).select('storeName');
    await notifyAdmins({
      type: 'APPROVAL',
      title: 'Product submitted for review',
      message: `${vendor?.storeName || 'Vendor'} submitted ${product.name} for review.`,
      linkUrl: '/admin/products',
      metadata: { event: 'product.submitted', productId: product._id.toString(), productName: product.name }
    });

    const populated = await populateProduct(product);
    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

exports.vendorUnpublishProduct = async (req, res, next) => {
  try {
    if (!VENDOR_CAN_UNPUBLISH) return res.status(403).json({ success: false, message: 'Vendor unpublish is disabled by policy' });

    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const isOwner = await canVendorAccessProduct(product, req.user.id);
    if (!isOwner) return res.status(403).json({ success: false, message: 'Not authorized to unpublish this product' });
    if (product.status !== PRODUCT_STATUS.PUBLISHED) {
      return res.status(400).json({ success: false, message: 'Only published products can be unpublished' });
    }

    product.isActive = false;
    product.lastEditedAt = new Date();
    product.lastEditedBy = req.user.id;
    await product.save();

    await createHistory({
      productId: product._id,
      actorId: req.user.id,
      actorRole: 'VENDOR',
      action: 'UNPUBLISH',
      previousStatus: product.status,
      newStatus: product.status,
      changes: { isActive: { from: true, to: false } }
    });

    const populated = await populateProduct(product);
    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

exports.vendorRepublishProduct = async (req, res, next) => {
  try {
    if (!VENDOR_CAN_REPUBLISH) return res.status(403).json({ success: false, message: 'Vendor republish is disabled by policy' });

    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const isOwner = await canVendorAccessProduct(product, req.user.id);
    if (!isOwner) return res.status(403).json({ success: false, message: 'Not authorized to publish this product' });
    if (product.status !== PRODUCT_STATUS.PUBLISHED) {
      return res.status(400).json({ success: false, message: 'Only previously approved products can be republished by vendors' });
    }

    product.isActive = true;
    product.lastEditedAt = new Date();
    product.lastEditedBy = req.user.id;
    await product.save();

    await createHistory({
      productId: product._id,
      actorId: req.user.id,
      actorRole: 'VENDOR',
      action: 'PUBLISH',
      previousStatus: product.status,
      newStatus: product.status,
      changes: { isActive: { from: false, to: true } }
    });

    const populated = await populateProduct(product);
    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

exports.approveProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const previousStatus = product.status;
    product.status = PRODUCT_STATUS.PUBLISHED;
    product.isActive = true;
    product.publishedAt = new Date();
    product.publishedBy = req.user.id;
    product.rejectedAt = undefined;
    product.rejectedBy = undefined;
    product.rejectionReason = '';
    product.lastEditedAt = new Date();
    product.lastEditedBy = req.user.id;
    await product.save();

    await createHistory({
      productId: product._id,
      actorId: req.user.id,
      actorRole: 'ADMIN',
      action: 'APPROVE',
      previousStatus,
      newStatus: product.status,
      changes: { isActive: true, publishedAt: product.publishedAt }
    });

    await createProductAuditLog({ req, actionType: 'PRODUCT_APPROVE', productId: product._id, metadata: { previousStatus, newStatus: product.status } });

    const vendorUser = await User.findById(product.vendorId).select('name email role');
    if (vendorUser) {
      await notifyUser({
        user: vendorUser,
        type: 'APPROVAL',
        title: 'Product approved',
        message: `${product.name} has been approved and published.`,
        linkUrl: '/vendor/products',
        metadata: { event: 'product.approved', productId: product._id.toString() }
      });
    }

    const populated = await populateProduct(product);
    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

exports.rejectProduct = async (req, res, next) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'reason is required' });

    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const previousStatus = product.status;
    product.status = PRODUCT_STATUS.REJECTED;
    product.rejectedAt = new Date();
    product.rejectedBy = req.user.id;
    product.rejectionReason = reason;
    product.isActive = false;
    product.lastEditedAt = new Date();
    product.lastEditedBy = req.user.id;
    await product.save();

    await createHistory({
      productId: product._id,
      actorId: req.user.id,
      actorRole: 'ADMIN',
      action: 'REJECT',
      previousStatus,
      newStatus: product.status,
      changes: { rejectionReason: reason },
      note: reason
    });

    await createProductAuditLog({ req, actionType: 'PRODUCT_REJECT', productId: product._id, metadata: { previousStatus, newStatus: product.status, reason } });

    const vendorUser = await User.findById(product.vendorId).select('name email role');
    if (vendorUser) {
      await notifyUser({
        user: vendorUser,
        type: 'APPROVAL',
        title: 'Product rejected',
        message: `${product.name} was rejected. Reason: ${reason}`,
        linkUrl: '/vendor/products',
        metadata: { event: 'product.rejected', productId: product._id.toString(), reason }
      });
    }

    const populated = await populateProduct(product);
    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};
exports.adminUnpublishProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const reason = String(req.body?.reasonOptional || req.body?.reason || '').trim();
    product.isActive = false;
    product.lastEditedAt = new Date();
    product.lastEditedBy = req.user.id;
    await product.save();

    await createHistory({
      productId: product._id,
      actorId: req.user.id,
      actorRole: 'ADMIN',
      action: 'UNPUBLISH',
      previousStatus: product.status,
      newStatus: product.status,
      changes: { isActive: { from: true, to: false } },
      note: reason || undefined
    });

    await createProductAuditLog({
      req,
      actionType: 'PRODUCT_UNPUBLISH',
      productId: product._id,
      metadata: { status: product.status, isActive: false, reason: reason || null }
    });

    const vendorUser = await User.findById(product.vendorId).select('name email role');
    if (vendorUser) {
      await notifyUser({
        user: vendorUser,
        type: 'ACCOUNT',
        title: 'Product unpublished by admin',
        message: reason ? `${product.name} was unpublished. Reason: ${reason}` : `${product.name} was unpublished by admin.`,
        linkUrl: '/vendor/products',
        metadata: { event: 'product.unpublished.admin', productId: product._id.toString(), reason: reason || null }
      });
    }

    const populated = await populateProduct(product);
    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

exports.adminRepublishProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    if (product.status !== PRODUCT_STATUS.PUBLISHED) {
      return res.status(400).json({ success: false, message: 'Only approved products can be republished' });
    }

    product.isActive = true;
    product.lastEditedAt = new Date();
    product.lastEditedBy = req.user.id;
    await product.save();

    await createHistory({
      productId: product._id,
      actorId: req.user.id,
      actorRole: 'ADMIN',
      action: 'PUBLISH',
      previousStatus: product.status,
      newStatus: product.status,
      changes: { isActive: { from: false, to: true } }
    });

    await createProductAuditLog({ req, actionType: 'PRODUCT_PUBLISH', productId: product._id, metadata: { status: product.status, isActive: true } });

    const populated = await populateProduct(product);
    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

exports.getProductHistory = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    if (req.user.role !== 'admin') {
      const isOwner = await canVendorAccessProduct(product, req.user.id);
      if (!isOwner) return res.status(403).json({ success: false, message: 'Not authorized to view this product history' });
    }

    const [history, total] = await Promise.all([
      ProductHistory.find({ productId: product._id }).populate('actorId', 'name email role').sort('-createdAt').skip(skip).limit(limit),
      ProductHistory.countDocuments({ productId: product._id })
    ]);

    return res.status(200).json({ success: true, count: history.length, total, pages: Math.ceil(total / limit), currentPage: page, data: history });
  } catch (error) {
    next(error);
  }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id || req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const isOwner = await canVendorAccessProduct(product, req.user.id);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this product' });
    }

    product.isActive = false;
    product.lastEditedAt = new Date();
    product.lastEditedBy = req.user.id;
    await product.save();

    await createHistory({
      productId: product._id,
      actorId: req.user.id,
      actorRole: actorRoleFromUser(req.user),
      action: 'ARCHIVE',
      previousStatus: product.status,
      newStatus: product.status,
      changes: { isActive: { from: true, to: false } }
    });

    const vendor = await Vendor.findById(product.vendor);
    if (vendor) {
      vendor.totalProducts = Math.max(0, vendor.totalProducts - 1);
      await vendor.save();
    }

    res.status(200).json({ success: true, message: 'Product archived successfully' });
  } catch (error) {
    next(error);
  }
};

exports.reportProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product || !product.isActive || product.status !== PRODUCT_STATUS.PUBLISHED) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const alreadyReported = product.reports.some((report) => report.reporter.toString() === req.user.id && report.status === 'open');
    if (alreadyReported) {
      return res.status(400).json({ success: false, message: 'You already have an open report for this product' });
    }

    product.reports.push({ reporter: req.user.id, reason: req.body.reason, details: req.body.details });
    product.reportCount = product.reports.filter((report) => report.status === 'open').length;
    product.lastEditedAt = new Date();
    product.lastEditedBy = req.user.id;
    await product.save();

    await createProductAuditLog({ req, actionType: 'PRODUCT_FLAG', productId: product._id, metadata: { reason: req.body.reason, details: req.body.details || null } });

    res.status(201).json({ success: true, message: 'Product reported successfully', data: product });
  } catch (error) {
    next(error);
  }
};

exports.getReportedProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const reportStatus = req.query.reportStatus || 'open';
    const query = reportStatus === 'all' ? { reportCount: { $gt: 0 } } : { reports: { $elemMatch: { status: reportStatus } } };

    const [products, total] = await Promise.all([
      Product.find(query).populate('vendor', 'storeName').populate('reports.reporter', 'name email').sort('-reportCount -createdAt').skip(skip).limit(limit),
      Product.countDocuments(query)
    ]);

    res.status(200).json({ success: true, count: products.length, total, pages: Math.ceil(total / limit), currentPage: page, data: products });
  } catch (error) {
    next(error);
  }
};

exports.moderateProduct = async (req, res, next) => {
  try {
    const { action, reason } = req.body;
    if (action === 'approve') {
      req.params.productId = req.params.id;
      return exports.approveProduct(req, res, next);
    }
    if (action === 'reject') {
      req.params.productId = req.params.id;
      req.body.reason = reason || 'Rejected by admin';
      return exports.rejectProduct(req, res, next);
    }
    return res.status(400).json({ success: false, message: 'Unsupported moderation action' });
  } catch (error) {
    next(error);
  }
};

exports.getProductAuditTrail = async (req, res, next) => {
  req.params.productId = req.params.id;
  return exports.getProductHistory(req, res, next);
};

exports.getVendorProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;
    const skip = (page - 1) * limit;
    const query = { vendor: req.params.vendorId, ...PUBLIC_PRODUCT_QUERY };

    const [products, total] = await Promise.all([
      Product.find(query).populate('category', 'name slug').sort('-createdAt').skip(skip).limit(limit),
      Product.countDocuments(query)
    ]);

    res.status(200).json({ success: true, count: products.length, total, pages: Math.ceil(total / limit), currentPage: page, data: products });
  } catch (error) {
    next(error);
  }
};

exports.getFeaturedProducts = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 8;
    let products = await Product.find({ featured: true, ...PUBLIC_PRODUCT_QUERY })
      .populate('vendor', 'storeName slug logo')
      .populate('category', 'name slug')
      .sort('-rating -totalSales')
      .limit(limit);

    if (products.length === 0) {
      products = await Product.find(PUBLIC_PRODUCT_QUERY)
        .populate('vendor', 'storeName slug logo')
        .populate('category', 'name slug')
        .sort('-rating -totalSales -createdAt')
        .limit(limit);
    }

    res.status(200).json({ success: true, count: products.length, data: products });
  } catch (error) {
    next(error);
  }
};
