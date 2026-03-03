const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Category = require('../models/Category');
const ProductHistory = require('../models/ProductHistory');
const ProductAnalyticsEvent = require('../models/ProductAnalyticsEvent');
const { notifyAdmins, notifyUser } = require('../services/notificationService');
const { logActivity, logAudit, resolveIp } = require('../services/loggingService');
const { detectProhibitedKeywords } = require('../utils/prohibitedRules');
const { triggerPriceDropAlerts, triggerBackInStockAlerts } = require('../services/productAlertService');

const PRODUCT_STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  PUBLISHED: 'PUBLISHED',
  REJECTED: 'REJECTED'
};
const VENDOR_MAX_PRODUCTS = 5;
const MAX_PRODUCT_STOCK = 1e9;

const VENDOR_CAN_UNPUBLISH = String(process.env.VENDOR_CAN_UNPUBLISH || 'false').toLowerCase() === 'true';
const VENDOR_CAN_REPUBLISH = String(process.env.VENDOR_CAN_REPUBLISH || 'false').toLowerCase() === 'true';

const VENDOR_EDITABLE_FIELDS = [
  'name', 'description', 'shortDescription', 'productType', 'category', 'subcategory', 'tags',
  'price', 'compareAtPrice', 'costPrice', 'sku', 'stock', 'trackInventory', 'lowStockThreshold',
  'variants', 'images', 'digitalFile', 'serviceDetails', 'shipping', 'seo',
  'brand', 'location', 'specifications'
];

const VENDOR_EDITABLE_WHEN_PUBLISHED = ['description', 'shortDescription', 'tags', 'images', 'seo'];

const FORBIDDEN_VENDOR_FIELDS = new Set([
  'status', 'isActive', 'submittedForReviewAt', 'publishedAt', 'publishedBy', 'rejectedAt',
  'rejectedBy', 'rejectionReason', 'lastEditedAt', 'lastEditedBy', 'vendor', 'vendorId'
]);

const PUBLIC_PRODUCT_QUERY = { status: PRODUCT_STATUS.PUBLISHED, isActive: true };
const PUBLIC_PRODUCT_EXCLUDE_FIELDS = '-costPrice -reports -activityLogs -rejectionReason -rejectedBy -publishedBy -lastEditedBy -rejectedAt';
const trendingCache = new Map();
const TRENDING_CACHE_TTL_MS = 15 * 60 * 1000;

function parsePagination(query, defaults = { page: 1, limit: 12 }) {
  const page = Math.max(1, parseInt(query.page, 10) || defaults.page);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaults.limit));
  return { page, limit, skip: (page - 1) * limit };
}

async function resolveCategoryFilter(categoryParam) {
  if (!categoryParam) return null;
  const value = String(categoryParam).trim();
  if (!value) return null;
  if (/^[a-f\d]{24}$/i.test(value)) {
    return value;
  }

  const bySlug = await Category.findOne({ slug: value.toLowerCase(), isActive: true }).select('_id');
  if (bySlug) return bySlug._id;

  const byName = await Category.findOne({ name: { $regex: `^${value}$`, $options: 'i' }, isActive: true }).select('_id');
  return byName?._id || null;
}

async function getPublicVisibilityFilters() {
  const [categories, vendors] = await Promise.all([
    Category.find({ isActive: true }).select('_id'),
    Vendor.find({
      isActive: true,
      $and: [
        {
          $or: [
            { vendorStatus: 'ACTIVE' },
            {
              vendorStatus: { $exists: false },
              status: 'approved'
            }
          ]
        },
        {
          $or: [
            { accountStatus: 'active' },
            { accountStatus: { $exists: false } }
          ]
        }
      ]
    }).select('_id')
  ]);

  return {
    category: { $in: categories.map((item) => item._id) },
    vendor: { $in: vendors.map((item) => item._id) }
  };
}

function isObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ''));
}

function parsePublicVendorSort(sort) {
  const value = String(sort || 'newest').toLowerCase();
  if (value === 'price' || value === 'price_asc' || value === 'price-asc') {
    return { price: 1, createdAt: -1 };
  }
  if (value === 'price_desc' || value === 'price-desc') {
    return { price: -1, createdAt: -1 };
  }
  if (value === 'popular' || value === 'best_selling' || value === 'best-selling') {
    return { totalSales: -1, createdAt: -1 };
  }
  return { createdAt: -1 };
}

function isVendorPubliclyActive(vendor) {
  if (!vendor || vendor.isActive === false) return false;
  const vendorStatus = String(vendor.vendorStatus || '').toUpperCase();
  const legacyStatus = String(vendor.status || '').toLowerCase();
  const accountStatus = String(vendor.accountStatus || '').toLowerCase();
  if (vendorStatus === 'ACTIVE') {
    return accountStatus ? accountStatus === 'active' : true;
  }
  return legacyStatus === 'approved' && (!accountStatus || accountStatus === 'active');
}

async function resolveVendorForPublicProducts(vendorParam) {
  if (!isObjectId(vendorParam)) return null;
  const vendor = await Vendor.findOne({
    $or: [{ _id: vendorParam }, { user: vendorParam }]
  }).select('_id user vendorStatus status accountStatus isActive');
  if (!isVendorPubliclyActive(vendor)) return null;
  return vendor;
}

function validateStockUpperBound(stock) {
  if (stock === undefined || stock === null || stock === '') return;
  const numeric = Number(stock);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > MAX_PRODUCT_STOCK) {
    const error = new Error(`stock must be between 0 and ${MAX_PRODUCT_STOCK}`);
    error.statusCode = 400;
    throw error;
  }
}

function validateProductStockPayload(payload) {
  validateStockUpperBound(payload?.stock);
  if (Array.isArray(payload?.variants)) {
    payload.variants.forEach((variant) => validateStockUpperBound(variant?.stock));
  }
}

function getTrendingCache(key) {
  const entry = trendingCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TRENDING_CACHE_TTL_MS) {
    trendingCache.delete(key);
    return null;
  }
  return entry.value;
}

function setTrendingCache(key, value) {
  trendingCache.set(key, { value, createdAt: Date.now() });
}

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
  await logAudit({
    actorAdminId: req.user.id,
    actionType,
    targetType: 'PRODUCT',
    targetId: productId,
    reason: metadata?.reason || '',
    metadata: metadata || {},
    ipAddress: resolveIp(req),
    userAgent: req.headers['user-agent'] || ''
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

    const productCount = await Product.countDocuments({ vendorId: req.user.id, isDeleted: { $ne: true } });
    if (productCount >= VENDOR_MAX_PRODUCTS) {
      return res.status(403).json({
        success: false,
        message: 'Product limit reached. Vendors can create up to 5 products.',
        remainingSlots: 0
      });
    }

    const payload = { ...req.body };
    FORBIDDEN_VENDOR_FIELDS.forEach((field) => delete payload[field]);
    validateProductStockPayload(payload);

    const product = await Product.create({
      ...payload,
      vendor: vendor._id,
      vendorId: req.user.id,
      status: PRODUCT_STATUS.DRAFT,
      isActive: true,
      lastEditedAt: new Date(),
      lastEditedBy: req.user.id
    });

    await logActivity({
      userId: req.user.id,
      role: req.user.role,
      action: 'PRODUCT_CREATE',
      entityType: 'PRODUCT',
      entityId: product._id,
      metadata: { title: product.name, status: product.status },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
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
    res.status(201).json({
      success: true,
      data: populated,
      remainingSlots: Math.max(0, VENDOR_MAX_PRODUCTS - (productCount + 1))
    });
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

    if (req.query.status && req.query.status !== 'all') {
      if (req.query.status === 'FLAGGED') {
        query.reportCount = { $gt: 0 };
      } else if (req.query.status === 'UNPUBLISHED') {
        query.isActive = false;
      } else {
        query.status = req.query.status;
      }
    }
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

function buildPublicSort(sort, hasTextQuery) {
  if (sort === 'price_asc' || sort === 'price-asc') return { price: 1, createdAt: -1 };
  if (sort === 'price_desc' || sort === 'price-desc') return { price: -1, createdAt: -1 };
  if (sort === 'newest') return { createdAt: -1 };
  if (sort === 'rating_desc' || sort === 'rating') return { ratingAvg: -1, rating: -1, ratingCount: -1 };
  if (sort === 'best_selling' || sort === 'popular') return { totalSales: -1, createdAt: -1 };
  if (hasTextQuery) return { score: { $meta: 'textScore' }, createdAt: -1 };
  return { createdAt: -1 };
}

exports.getAllProducts = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 12 });
    const query = { ...PUBLIC_PRODUCT_QUERY, ...(await getPublicVisibilityFilters()) };
    const q = String(req.query.search || '').trim();

    if (req.query.category) {
      const categoryId = await resolveCategoryFilter(req.query.category);
      if (categoryId) query.category = categoryId;
      else return res.status(200).json({ success: true, count: 0, total: 0, pages: 0, currentPage: page, data: [] });
    }
    if (req.query.vendor) query.vendor = req.query.vendor;
    if (req.query.type) query.productType = req.query.type;
    if (req.query.minPrice || req.query.maxPrice) {
      query.price = {};
      if (req.query.minPrice !== undefined) {
        const min = parseFloat(req.query.minPrice);
        if (Number.isNaN(min) || min < 0) return res.status(400).json({ success: false, message: 'minPrice must be a non-negative number' });
        query.price.$gte = min;
      }
      if (req.query.maxPrice !== undefined) {
        const max = parseFloat(req.query.maxPrice);
        if (Number.isNaN(max) || max < 0) return res.status(400).json({ success: false, message: 'maxPrice must be a non-negative number' });
        query.price.$lte = max;
      }
      if (query.price.$gte !== undefined && query.price.$lte !== undefined && query.price.$gte > query.price.$lte) {
        return res.status(400).json({ success: false, message: 'minPrice cannot be greater than maxPrice' });
      }
    }
    if (q) query.$text = { $search: q.slice(0, 120) };

    const sort = buildPublicSort(req.query.sort, Boolean(q));

    const [products, total] = await Promise.all([
      Product.find(query)
        .select(PUBLIC_PRODUCT_EXCLUDE_FIELDS)
        .populate('vendor', 'storeName slug logo rating')
        .populate('category', 'name slug')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Product.countDocuments(query)
    ]);

    res.status(200).json({ success: true, count: products.length, total, pages: Math.ceil(total / limit), currentPage: page, data: products });
  } catch (error) {
    next(error);
  }
};

exports.getProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).populate('vendor', 'storeName slug logo rating totalReviews vendorStatus isActive').populate('category', 'name slug isActive');
    const vendorBlocked = !product?.vendor || product.vendor.vendorStatus !== 'ACTIVE' || product.vendor.isActive === false;
    const categoryBlocked = !product?.category || product.category.isActive === false;
    if (!product || product.status !== PRODUCT_STATUS.PUBLISHED || !product.isActive || vendorBlocked || categoryBlocked) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    product.views += 1;
    await product.save({ validateBeforeSave: false });
    const sanitized = await Product.findById(product._id)
      .select(PUBLIC_PRODUCT_EXCLUDE_FIELDS)
      .populate('vendor', 'storeName slug logo rating totalReviews vendorStatus isActive')
      .populate('category', 'name slug isActive');
    res.status(200).json({ success: true, data: sanitized });
  } catch (error) {
    next(error);
  }
};

exports.getProductBySlug = async (req, res, next) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug }).populate('vendor', 'storeName slug logo rating totalReviews vendorStatus isActive').populate('category', 'name slug isActive');
    const vendorBlocked = !product?.vendor || product.vendor.vendorStatus !== 'ACTIVE' || product.vendor.isActive === false;
    const categoryBlocked = !product?.category || product.category.isActive === false;
    if (!product || product.status !== PRODUCT_STATUS.PUBLISHED || !product.isActive || vendorBlocked || categoryBlocked) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    product.views += 1;
    await product.save({ validateBeforeSave: false });
    const sanitized = await Product.findById(product._id)
      .select(PUBLIC_PRODUCT_EXCLUDE_FIELDS)
      .populate('vendor', 'storeName slug logo rating totalReviews vendorStatus isActive')
      .populate('category', 'name slug isActive');
    res.status(200).json({ success: true, data: sanitized });
  } catch (error) {
    next(error);
  }
};

exports.updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.productId || req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    const previousPrice = product.price;
    const previousStock = product.stock;

    const isOwner = await canVendorAccessProduct(product, req.user.id);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to update this product' });
    }
    validateProductStockPayload(req.body || {});

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
      await Promise.all([
        triggerPriceDropAlerts({ product, oldPrice: previousPrice, newPrice: product.price }),
        triggerBackInStockAlerts({ product, oldStock: previousStock, newStock: product.stock })
      ]);

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
    await Promise.all([
      triggerPriceDropAlerts({ product, oldPrice: previousPrice, newPrice: product.price }),
      triggerBackInStockAlerts({ product, oldStock: previousStock, newStock: product.stock })
    ]);

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

    await logActivity({
      userId: req.user.id,
      role: req.user.role,
      action: 'PRODUCT_CREATE',
      entityType: 'PRODUCT',
      entityId: product._id,
      metadata: { title: product.name, status: product.status, submittedForReviewAt: product.submittedForReviewAt },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
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

    await createProductAuditLog({ req, actionType: 'PRODUCT_REPUBLISH', productId: product._id, metadata: { status: product.status, isActive: true } });

    const populated = await populateProduct(product);
    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

exports.adminFlagProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const reason = String(req.body?.reason || '').trim();
    const severity = String(req.body?.severity || 'MEDIUM').toUpperCase();
    if (!reason) return res.status(400).json({ success: false, message: 'reason is required' });
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(severity)) {
      return res.status(400).json({ success: false, message: 'severity must be LOW, MEDIUM, or HIGH' });
    }

    const prohibitedHits = detectProhibitedKeywords(`${product.name || ''} ${product.description || ''}`);
    product.reports.push({
      reporter: req.user.id,
      reason: 'other',
      details: `[ADMIN_FLAG][${severity}] ${reason}${prohibitedHits.length ? ` | prohibitedKeywords: ${prohibitedHits.join(', ')}` : ''}`,
      status: 'open'
    });
    product.reportCount = product.reports.filter((report) => report.status === 'open').length;
    product.isActive = false;
    product.lastEditedAt = new Date();
    product.lastEditedBy = req.user.id;
    await product.save();

    await createProductAuditLog({
      req,
      actionType: 'PRODUCT_FLAG',
      productId: product._id,
      metadata: {
        reason,
        severity,
        prohibitedKeywords: prohibitedHits
      }
    });

    return res.status(200).json({ success: true, data: product });
  } catch (error) {
    return next(error);
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
    const vendor = await resolveVendorForPublicProducts(req.params.vendorId);
    if (!vendor) {
      return res.status(200).json({
        success: true,
        data: [],
        page,
        limit,
        total: 0,
        totalPages: 0,
        count: 0,
        pages: 0,
        currentPage: page
      });
    }
    const query = { vendor: vendor._id, ...(await getPublicVisibilityFilters()), ...PUBLIC_PRODUCT_QUERY };
    const sort = parsePublicVendorSort(req.query.sort);

    const [products, total] = await Promise.all([
      Product.find(query).select(PUBLIC_PRODUCT_EXCLUDE_FIELDS).populate('category', 'name slug').sort(sort).skip(skip).limit(limit),
      Product.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limit);
    res.status(200).json({
      success: true,
      data: products,
      page,
      limit,
      total,
      totalPages,
      count: products.length,
      pages: totalPages,
      currentPage: page
    });
  } catch (error) {
    next(error);
  }
};

exports.getPublicVendorProducts = async (req, res, next) => {
  return exports.getVendorProducts(req, res, next);
};

exports.getFeaturedProducts = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 8 });
    const visibility = await getPublicVisibilityFilters();
    let [products, total] = await Promise.all([
      Product.find({ featured: true, ...PUBLIC_PRODUCT_QUERY, ...visibility })
        .select(PUBLIC_PRODUCT_EXCLUDE_FIELDS)
        .populate('vendor', 'storeName slug logo')
        .populate('category', 'name slug')
        .sort({ ratingAvg: -1, totalSales: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Product.countDocuments({ featured: true, ...PUBLIC_PRODUCT_QUERY, ...visibility })
    ]);

    if (products.length === 0 && page === 1) {
      [products, total] = await Promise.all([
        Product.find({ ...PUBLIC_PRODUCT_QUERY, ...visibility })
          .select(PUBLIC_PRODUCT_EXCLUDE_FIELDS)
          .populate('vendor', 'storeName slug logo')
          .populate('category', 'name slug')
          .sort({ ratingAvg: -1, totalSales: -1, createdAt: -1 })
          .limit(limit),
        Product.countDocuments({ ...PUBLIC_PRODUCT_QUERY, ...visibility })
      ]);
    }

    res.status(200).json({
      success: true,
      count: products.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: products
    });
  } catch (error) {
    next(error);
  }
};

exports.searchProducts = async (req, res, next) => {
  req.query.search = req.query.q || req.query.search;
  return exports.getAllProducts(req, res, next);
};

exports.getTrendingProducts = async (req, res, next) => {
  try {
    const range = String(req.query.range || '7d');
    const days = range === '30d' ? 30 : 7;
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 8 });
    const cacheKey = `trending:${days}:${page}:${limit}`;
    const cached = getTrendingCache(cacheKey);
    if (cached) return res.status(200).json({ success: true, ...cached, cached: true });

    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const pipeline = [
      {
        $match: {
          createdAt: { $gte: fromDate },
          eventType: { $in: ['VIEW', 'CLICK', 'ADD_TO_CART', 'PURCHASE'] }
        }
      },
      {
        $group: {
          _id: '$productId',
          views: { $sum: { $cond: [{ $eq: ['$eventType', 'VIEW'] }, 1, 0] } },
          clicks: { $sum: { $cond: [{ $eq: ['$eventType', 'CLICK'] }, 1, 0] } },
          addToCart: { $sum: { $cond: [{ $eq: ['$eventType', 'ADD_TO_CART'] }, 1, 0] } },
          purchases: { $sum: { $cond: [{ $eq: ['$eventType', 'PURCHASE'] }, 1, 0] } }
        }
      },
      {
        $project: {
          productId: '$_id',
          views: 1,
          clicks: 1,
          addToCart: 1,
          purchases: 1,
          trendingScore: {
            $add: [
              '$views',
              { $multiply: ['$clicks', 2] },
              { $multiply: ['$addToCart', 3] },
              { $multiply: ['$purchases', 8] }
            ]
          }
        }
      },
      { $sort: { trendingScore: -1, purchases: -1, clicks: -1 } },
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      { $match: { 'product.status': PRODUCT_STATUS.PUBLISHED, 'product.isActive': true } },
      {
        $facet: {
          total: [{ $count: 'value' }],
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                trendingScore: 1,
                views: 1,
                clicks: 1,
                addToCart: 1,
                purchases: 1,
                product: 1
              }
            }
          ]
        }
      }
    ];

    const agg = await ProductAnalyticsEvent.aggregate(pipeline);
    const total = agg[0]?.total?.[0]?.value || 0;
    const rows = agg[0]?.data || [];

    const productIds = rows.map((row) => row.product._id);
    const products = await Product.find({ _id: { $in: productIds } })
      .populate('vendor', 'storeName slug logo')
      .populate('category', 'name slug')
      .select('name title description shortDescription slug price images category vendor rating ratingAvg ratingCount totalSales createdAt featured status isActive');
    const productMap = new Map(products.map((p) => [String(p._id), p]));
    let orderedProducts = rows
      .map((row) => {
        const product = productMap.get(String(row.product._id));
        if (!product) return null;
        return {
          ...product.toObject(),
          trendingScore: row.trendingScore,
          trendingMetrics: {
            views: row.views,
            clicks: row.clicks,
            addToCart: row.addToCart,
            purchases: row.purchases
          }
        };
      })
      .filter(Boolean);

    if (orderedProducts.length === 0) {
      const fallback = await Product.find(PUBLIC_PRODUCT_QUERY)
        .select(PUBLIC_PRODUCT_EXCLUDE_FIELDS)
        .populate('vendor', 'storeName slug logo rating')
        .populate('category', 'name slug')
        .sort({ totalSales: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit);
      orderedProducts = fallback.map((product) => ({
        ...product.toObject(),
        trendingScore: product.totalSales || 0,
        trendingMetrics: {
          views: product.views || 0,
          clicks: 0,
          addToCart: 0,
          purchases: product.totalSales || 0
        }
      }));
    }

    const payload = {
      count: orderedProducts.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: orderedProducts
    };
    setTrendingCache(cacheKey, payload);
    res.status(200).json({ success: true, ...payload });
  } catch (error) {
    next(error);
  }
};
