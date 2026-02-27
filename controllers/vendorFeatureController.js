const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const Papa = require('papaparse');
const cloudinary = require('../utils/cloudinary');
const Vendor = require('../models/Vendor');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Review = require('../models/Review');
const ReviewReport = require('../models/ReviewReport');
const ReviewReply = require('../models/ReviewReply');
const StockAlertSubscription = require('../models/StockAlertSubscription');
const StockReservation = require('../models/StockReservation');
const ProductAnalyticsEvent = require('../models/ProductAnalyticsEvent');
const VendorCoupon = require('../models/VendorCoupon');
const ProductBundle = require('../models/ProductBundle');
const FlashSale = require('../models/FlashSale');
const PromotedListing = require('../models/PromotedListing');
const VendorTransaction = require('../models/VendorTransaction');
const PayoutRequest = require('../models/PayoutRequest');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { normalizeItemStatus, computeOverallOrderStatus, mapOrderStatusToLegacy } = require('../utils/orderWorkflow');

const PRODUCT_STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  PUBLISHED: 'PUBLISHED',
  REJECTED: 'REJECTED'
};

let jobsStarted = false;

function toObjectId(value) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

function sanitizeText(value, max = 2000) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function sanitizeRichText(value, max = 8000) {
  return sanitizeText(value, max);
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parsePagination(query, defaultLimit = 20) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return n;
}

function isValidUrl(value) {
  if (!value) return true;
  try {
    const parsed = new URL(String(value));
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (_error) {
    return false;
  }
}

function normalizeBusinessHours(hours) {
  if (!hours) return [];
  if (Array.isArray(hours)) {
    return hours.map((item) => ({
      dayOfWeek: sanitizeText(item.dayOfWeek, 20),
      open: sanitizeText(item.open, 10),
      close: sanitizeText(item.close, 10),
      closed: Boolean(item.closed)
    }));
  }
  return [];
}

function normalizeLocation(location = {}) {
  return {
    address: sanitizeText(location.address || location.addressLine, 220),
    city: sanitizeText(location.city, 120),
    province: sanitizeText(location.province || location.state, 120),
    lat: location.lat === undefined || location.lat === null ? undefined : safeNumber(location.lat),
    lng: location.lng === undefined || location.lng === null ? undefined : safeNumber(location.lng)
  };
}

function normalizeStorePolicies(policies = {}) {
  return {
    shippingPolicy: sanitizeRichText(policies.shippingPolicy, 4000),
    returnsPolicy: sanitizeRichText(policies.returnsPolicy, 4000),
    refundPolicy: sanitizeRichText(policies.refundPolicy, 4000),
    terms: sanitizeRichText(policies.terms, 6000)
  };
}

function normalizeSocialLinks(social = {}) {
  const out = {
    instagram: sanitizeText(social.instagram, 240),
    facebook: sanitizeText(social.facebook, 240),
    tiktok: sanitizeText(social.tiktok, 240),
    website: sanitizeText(social.website, 240),
    youtube: sanitizeText(social.youtube, 240),
    whatsapp: sanitizeText(social.whatsapp, 120)
  };

  for (const key of ['instagram', 'facebook', 'tiktok', 'website', 'youtube']) {
    if (out[key] && !isValidUrl(out[key])) {
      const err = new Error(`${key} must be a valid URL`);
      err.statusCode = 400;
      throw err;
    }
  }

  return out;
}

async function resolveVendorForUser(userId) {
  return Vendor.findOne({ user: userId });
}

async function requireVendor(req, res) {
  const vendor = await resolveVendorForUser(req.user.id);
  if (!vendor) {
    res.status(404).json({ success: false, message: 'Vendor profile not found' });
    return null;
  }
  return vendor;
}

function assertActiveVendor(vendor) {
  if (String(vendor?.vendorStatus || '').toUpperCase() !== 'ACTIVE') {
    const error = new Error('Vendor account must be ACTIVE for this action');
    error.statusCode = 403;
    throw error;
  }
}

async function uploadImageBuffer(buffer, folder, transformation) {
  const result = await cloudinary.uploadAsset({
    buffer,
    folder,
    resourceType: 'image',
    transformation
  });

  return {
    public_id: result.publicId,
    url: result.originalUrl
  };
}

function buildPublicStore(vendor) {
  return {
    _id: vendor._id,
    storeName: vendor.storeName,
    storeSlug: vendor.storeSlug || vendor.usernameSlug || vendor.slug,
    logoUrl: vendor.logo?.url || vendor.profileImage?.url || '',
    coverImageUrl: vendor.coverImage?.url || vendor.banner?.url || '',
    description: vendor.bio || vendor.description || '',
    contact: {
      phone: vendor.contact?.phone || vendor.phone || '',
      email: vendor.contact?.email || vendor.email || '',
      whatsapp: vendor.contact?.whatsapp || vendor.socialLinks?.whatsapp || ''
    },
    location: {
      address: vendor.location?.address || vendor.location?.addressLine || vendor.address?.street || '',
      city: vendor.location?.city || vendor.address?.city || '',
      province: vendor.location?.province || vendor.location?.state || vendor.address?.state || '',
      lat: vendor.location?.lat ?? null,
      lng: vendor.location?.lng ?? null
    },
    businessHours: Array.isArray(vendor.businessHours) ? vendor.businessHours : [],
    socialLinks: vendor.socialLinks || {},
    storePolicies: vendor.storePolicies || {},
    rating: vendor.rating || 0,
    ratingCount: vendor.totalReviews || 0
  };
}

async function ensureVendorOwnsProduct(vendor, productId) {
  const product = await Product.findById(productId);
  if (!product) {
    const err = new Error('Product not found');
    err.statusCode = 404;
    throw err;
  }
  if (String(product.vendor) !== String(vendor._id)) {
    const err = new Error('Not authorized for this product');
    err.statusCode = 403;
    throw err;
  }
  return product;
}

function normalizeVariants(variants) {
  if (!Array.isArray(variants)) return [];
  return variants.map((variant) => ({
    sku: sanitizeText(variant.sku, 80),
    options: variant.options || {},
    priceOverride: variant.priceOverride === undefined ? undefined : safeNumber(variant.priceOverride, 0),
    stock: safeNumber(variant.stock, 0),
    name: sanitizeText(variant.name, 140),
    attributes: Array.isArray(variant.attributes) ? variant.attributes : undefined
  }));
}

async function assertUniqueSkusForVendor(vendorId, productData, excludeProductId = null) {
  const skuSet = new Set();
  const ownSku = sanitizeText(productData.sku, 80);
  if (ownSku) skuSet.add(ownSku.toUpperCase());

  for (const variant of normalizeVariants(productData.variants || [])) {
    if (!variant.sku) continue;
    const key = variant.sku.toUpperCase();
    if (skuSet.has(key)) {
      const err = new Error(`Duplicate SKU found in payload: ${variant.sku}`);
      err.statusCode = 400;
      throw err;
    }
    skuSet.add(key);
  }

  const query = {
    vendor: vendorId,
    $or: [
      { sku: { $in: [...skuSet] } },
      { 'variants.sku': { $in: [...skuSet] } }
    ]
  };
  if (excludeProductId) query._id = { $ne: excludeProductId };

  if (skuSet.size) {
    const conflict = await Product.findOne(query).select('_id');
    if (conflict) {
      const err = new Error('A SKU in this product already exists for your store');
      err.statusCode = 409;
      throw err;
    }
  }
}

function getVariantStock(product, sku) {
  if (!sku) return product.stock || 0;
  const variant = (product.variants || []).find((item) => String(item.sku || '').toUpperCase() === String(sku).toUpperCase());
  return variant ? safeNumber(variant.stock, 0) : 0;
}

function setVariantStock(product, sku, nextStock) {
  if (!sku) {
    product.stock = Math.max(0, safeNumber(nextStock, 0));
    return;
  }
  const variant = (product.variants || []).find((item) => String(item.sku || '').toUpperCase() === String(sku).toUpperCase());
  if (variant) variant.stock = Math.max(0, safeNumber(nextStock, 0));
}

async function maybeCreateLowStockAlerts({ product, vendor }) {
  const subscriptions = await StockAlertSubscription.find({
    vendorId: vendor._id,
    active: true,
    $or: [{ productId: product._id }, { variantSku: { $in: (product.variants || []).map((v) => v.sku).filter(Boolean) } }]
  });

  if (!subscriptions.length) return;

  const vendorUser = await User.findById(vendor.user).select('_id');
  if (!vendorUser) return;

  for (const sub of subscriptions) {
    const current = getVariantStock(product, sub.variantSku);
    if (current > sub.threshold) continue;

    await Notification.create({
      userId: vendorUser._id,
      role: 'VENDOR',
      type: 'SYSTEM',
      subType: 'LOW_STOCK_ALERT',
      title: 'Low stock alert',
      message: `${product.name} stock is ${current} (threshold ${sub.threshold})`,
      linkUrl: '/vendor/products',
      metadata: {
        productId: product._id.toString(),
        variantSku: sub.variantSku || null,
        threshold: sub.threshold,
        currentStock: current
      }
    });
  }
}

function parseRangeQuery(query) {
  const now = new Date();
  const range = String(query.range || '30d').toLowerCase();
  if (range === '7d') return { from: new Date(now.getTime() - 7 * 86400000), to: now };
  if (range === '90d') return { from: new Date(now.getTime() - 90 * 86400000), to: now };
  if (query.from || query.to) {
    return {
      from: query.from ? new Date(query.from) : new Date(now.getTime() - 30 * 86400000),
      to: query.to ? new Date(query.to) : now
    };
  }
  return { from: new Date(now.getTime() - 30 * 86400000), to: now };
}

function createBarcodeSvg(value) {
  const text = String(value || '').slice(0, 120);
  const bits = text
    .split('')
    .map((char) => char.charCodeAt(0).toString(2).padStart(8, '0'))
    .join('');
  const barWidth = 2;
  const height = 120;
  const margin = 20;
  const width = bits.length * barWidth + margin * 2;
  let x = margin;
  let rects = '';
  for (const bit of bits) {
    if (bit === '1') {
      rects += `<rect x="${x}" y="10" width="${barWidth}" height="${height}" fill="#111" />`;
    }
    x += barWidth;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="170" viewBox="0 0 ${width} 170">
  <rect width="${width}" height="170" fill="#fff"/>
  ${rects}
  <text x="${width / 2}" y="155" text-anchor="middle" font-family="Arial" font-size="16" fill="#111">${text}</text>
</svg>`;
}

function vendorItemsForOrder(order, vendorId) {
  return (order.items || []).filter((item) => String(item.vendorId || item.vendor) === String(vendorId));
}

async function generateOrderSubsetPdf({ order, vendor, items, type, res }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const filename = `${type}-${order.orderNumber}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  doc.pipe(res);

  doc.fontSize(20).text(type === 'packing-slip' ? 'Packing Slip' : 'Shipping Label', { align: 'center' });
  doc.moveDown();
  doc.fontSize(11).text(`Order: ${order.orderNumber}`);
  doc.text(`Vendor: ${vendor.storeName}`);
  doc.text(`Date: ${new Date(order.createdAt).toISOString()}`);
  doc.moveDown();
  doc.fontSize(12).text('Ship To:', { underline: true });
  doc.fontSize(10).text(`${order.shippingAddress?.fullName || ''}`);
  doc.text(`${order.shippingAddress?.street || ''}`);
  doc.text(`${order.shippingAddress?.city || ''}, ${order.shippingAddress?.state || ''}`);
  doc.text(`${order.shippingAddress?.country || ''} ${order.shippingAddress?.zipCode || ''}`);
  doc.moveDown();
  doc.fontSize(12).text('Items', { underline: true });
  doc.moveDown(0.5);

  for (const item of items) {
    const qty = item.qty || item.quantity || 0;
    const lineTotal = safeNumber(item.lineTotal ?? item.subtotal, 0);
    doc.fontSize(10).text(`${item.titleSnapshot || item.name} | Qty ${qty} | ${lineTotal.toFixed(2)} | ${normalizeItemStatus(item.status)}`);
  }

  doc.moveDown();
  const total = items.reduce((sum, item) => sum + safeNumber(item.lineTotal ?? item.subtotal, 0), 0);
  doc.fontSize(12).text(`Vendor item subtotal: ${total.toFixed(2)}`, { align: 'right' });
  doc.end();
}

exports.getVendorStore = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    return res.status(200).json({ success: true, data: buildPublicStore(vendor) });
  } catch (error) {
    return next(error);
  }
};

exports.updateVendorStore = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;

    const payload = req.body || {};
    const storeName = sanitizeText(payload.storeName || vendor.storeName, 120);
    if (!storeName) return res.status(400).json({ success: false, message: 'storeName is required' });

    const storeSlug = slugify(payload.storeSlug || payload.usernameSlug || vendor.storeSlug || vendor.usernameSlug || storeName);
    if (!storeSlug) return res.status(400).json({ success: false, message: 'storeSlug is required' });

    const existing = await Vendor.findOne({
      _id: { $ne: vendor._id },
      $or: [{ storeSlug }, { usernameSlug: storeSlug }, { slug: storeSlug }]
    }).select('_id');
    if (existing) return res.status(409).json({ success: false, message: 'storeSlug already in use' });

    vendor.storeName = storeName;
    vendor.storeSlug = storeSlug;
    vendor.slug = storeSlug;
    vendor.usernameSlug = storeSlug;
    vendor.bio = sanitizeRichText(payload.bio ?? payload.description ?? vendor.bio, 2000);
    vendor.description = vendor.bio;

    vendor.contact = {
      phone: sanitizeText(payload.contact?.phone ?? payload.phone ?? vendor.contact?.phone ?? vendor.phone, 60),
      email: sanitizeText(payload.contact?.email ?? payload.email ?? vendor.contact?.email ?? vendor.email, 200),
      whatsapp: sanitizeText(payload.contact?.whatsapp ?? vendor.contact?.whatsapp ?? vendor.socialLinks?.whatsapp, 60)
    };
    vendor.phone = vendor.contact.phone || vendor.phone;
    vendor.email = vendor.contact.email || vendor.email;

    vendor.location = {
      ...(vendor.location || {}),
      ...normalizeLocation(payload.location || {})
    };

    vendor.businessHours = normalizeBusinessHours(payload.businessHours ?? vendor.businessHours);
    vendor.socialLinks = normalizeSocialLinks(payload.socialLinks || vendor.socialLinks || {});
    vendor.storePolicies = normalizeStorePolicies(payload.storePolicies || vendor.storePolicies || {});
    vendor.settings = {
      ...(vendor.settings || {}),
      shippingPolicy: vendor.storePolicies.shippingPolicy || vendor.settings?.shippingPolicy || '',
      returnPolicy: vendor.storePolicies.returnsPolicy || vendor.settings?.returnPolicy || '',
      termsAndConditions: vendor.storePolicies.terms || vendor.settings?.termsAndConditions || ''
    };

    await vendor.save();

    return res.status(200).json({ success: true, data: buildPublicStore(vendor) });
  } catch (error) {
    return next(error);
  }
};

exports.uploadStoreLogo = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    if (!req.file) return res.status(400).json({ success: false, message: 'logo file is required' });

    const image = await uploadImageBuffer(req.file.buffer, 'nvm/vendors/logo', [
      { width: 700, height: 700, crop: 'limit' },
      { quality: 'auto' },
      { fetch_format: 'auto' }
    ]);

    vendor.logo = image;
    vendor.profileImage = image;
    await vendor.save();

    return res.status(200).json({ success: true, data: { logoUrl: image.url } });
  } catch (error) {
    return next(error);
  }
};

exports.uploadStoreCover = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    if (!req.file) return res.status(400).json({ success: false, message: 'cover file is required' });

    const image = await uploadImageBuffer(req.file.buffer, 'nvm/vendors/cover', [
      { width: 1800, height: 900, crop: 'limit' },
      { quality: 'auto' },
      { fetch_format: 'auto' }
    ]);

    vendor.coverImage = image;
    vendor.banner = image;
    await vendor.save();

    return res.status(200).json({ success: true, data: { coverImageUrl: image.url } });
  } catch (error) {
    return next(error);
  }
};

exports.getPublicStoreBySlug = async (req, res, next) => {
  try {
    const storeSlug = slugify(req.params.storeSlug);
    const vendor = await Vendor.findOne({
      $or: [{ storeSlug }, { usernameSlug: storeSlug }, { slug: storeSlug }],
      status: 'approved',
      isActive: true,
      $and: [
        {
          $or: [
            { accountStatus: 'active' },
            { accountStatus: { $exists: false } }
          ]
        },
        {
          $or: [
            { vendorStatus: 'ACTIVE' },
            { vendorStatus: { $exists: false } }
          ]
        }
      ]
    });
    if (!vendor) return res.status(404).json({ success: false, message: 'Store not found' });

    const [products, ratingSummary, reviews] = await Promise.all([
      Product.find({ vendor: vendor._id, status: PRODUCT_STATUS.PUBLISHED, isActive: true })
        .sort({ createdAt: -1 })
        .limit(60)
        .select('-reports -activityLogs'),
      Review.aggregate([
        { $match: { targetType: 'VENDOR', vendorId: vendor._id, status: 'APPROVED' } },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
            count: { $sum: 1 },
            r1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
            r2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
            r3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
            r4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
            r5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } }
          }
        }
      ]),
      Review.find({ targetType: 'VENDOR', vendorId: vendor._id, status: 'APPROVED' })
        .sort({ createdAt: -1 })
        .limit(12)
        .populate('reviewerId', 'name avatar')
    ]);

    const summary = ratingSummary[0] || { avgRating: 0, count: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };
    return res.status(200).json({
      success: true,
      data: {
        store: buildPublicStore(vendor),
        products,
        ratingSummary: {
          avgRating: Number((summary.avgRating || 0).toFixed(2)),
          count: summary.count || 0,
          breakdown: { 1: summary.r1 || 0, 2: summary.r2 || 0, 3: summary.r3 || 0, 4: summary.r4 || 0, 5: summary.r5 || 0 }
        },
        reviews
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.createVendorProduct = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const payload = req.body || {};
    await assertUniqueSkusForVendor(vendor._id, payload);

    const product = await Product.create({
      ...payload,
      vendor: vendor._id,
      vendorId: vendor.user,
      status: PRODUCT_STATUS.DRAFT,
      isActive: true,
      variants: normalizeVariants(payload.variants),
      specifications: Array.isArray(payload.specifications) ? payload.specifications : []
    });

    return res.status(201).json({ success: true, data: product });
  } catch (error) {
    return next(error);
  }
};

exports.updateVendorProduct = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const product = await ensureVendorOwnsProduct(vendor, req.params.id);
    const payload = req.body || {};

    await assertUniqueSkusForVendor(vendor._id, payload, product._id);
    const forbidden = ['status', 'vendor', 'vendorId', 'publishedBy', 'rejectedBy'];
    for (const key of forbidden) delete payload[key];
    if (payload.variants) payload.variants = normalizeVariants(payload.variants);

    Object.assign(product, payload);
    product.lastEditedAt = new Date();
    product.lastEditedBy = req.user.id;

    await product.save();
    await maybeCreateLowStockAlerts({ product, vendor });

    return res.status(200).json({ success: true, data: product });
  } catch (error) {
    return next(error);
  }
};

exports.submitVendorProduct = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    assertActiveVendor(vendor);

    const product = await ensureVendorOwnsProduct(vendor, req.params.id);
    if (![PRODUCT_STATUS.DRAFT, PRODUCT_STATUS.REJECTED].includes(product.status)) {
      return res.status(400).json({ success: false, message: 'Only DRAFT or REJECTED products can be submitted' });
    }

    product.status = PRODUCT_STATUS.PENDING;
    product.submittedForReviewAt = new Date();
    product.rejectedAt = undefined;
    product.rejectedBy = undefined;
    product.rejectionReason = '';
    await product.save();

    return res.status(200).json({ success: true, data: product });
  } catch (error) {
    return next(error);
  }
};

exports.unpublishVendorProduct = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const product = await ensureVendorOwnsProduct(vendor, req.params.id);
    if (product.status !== PRODUCT_STATUS.PUBLISHED) {
      return res.status(400).json({ success: false, message: 'Only published products can be unpublished' });
    }
    product.isActive = false;
    await product.save();
    return res.status(200).json({ success: true, data: product });
  } catch (error) {
    return next(error);
  }
};

exports.republishVendorProduct = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    assertActiveVendor(vendor);
    const product = await ensureVendorOwnsProduct(vendor, req.params.id);
    if (product.status !== PRODUCT_STATUS.PUBLISHED) {
      return res.status(400).json({ success: false, message: 'Only previously approved products can be republished' });
    }
    product.isActive = true;
    await product.save();
    return res.status(200).json({ success: true, data: product });
  } catch (error) {
    return next(error);
  }
};

exports.scheduleVendorProduct = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const product = await ensureVendorOwnsProduct(vendor, req.params.id);
    const scheduledPublishAt = req.body?.scheduledPublishAt ? new Date(req.body.scheduledPublishAt) : null;
    if (!scheduledPublishAt || Number.isNaN(scheduledPublishAt.getTime())) {
      return res.status(400).json({ success: false, message: 'scheduledPublishAt must be a valid date' });
    }
    product.scheduledPublishAt = scheduledPublishAt;
    if (product.status === PRODUCT_STATUS.PUBLISHED) {
      product.isActive = false;
    }
    await product.save();
    return res.status(200).json({ success: true, data: product });
  } catch (error) {
    return next(error);
  }
};

exports.bulkUploadVendorProducts = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    if (!req.file) return res.status(400).json({ success: false, message: 'CSV file is required' });

    const parsed = Papa.parse(req.file.buffer.toString('utf8'), {
      header: true,
      skipEmptyLines: true
    });
    if (parsed.errors?.length) {
      return res.status(400).json({ success: false, message: 'Invalid CSV format', errors: parsed.errors });
    }

    const requiredColumns = ['title', 'price', 'category', 'stock', 'sku', 'description'];
    const headers = parsed.meta?.fields || [];
    const missing = requiredColumns.filter((h) => !headers.includes(h));
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Missing required columns: ${missing.join(', ')}` });
    }

    let createdCount = 0;
    const failedRows = [];
    for (let i = 0; i < parsed.data.length; i += 1) {
      const row = parsed.data[i];
      try {
        const payload = {
          name: sanitizeText(row.title, 200),
          title: sanitizeText(row.title, 200),
          description: sanitizeRichText(row.description, 5000),
          category: row.category,
          price: safeNumber(row.price),
          stock: safeNumber(row.stock),
          sku: sanitizeText(row.sku, 80),
          vendor: vendor._id,
          vendorId: vendor.user,
          status: PRODUCT_STATUS.DRAFT,
          isActive: true,
          specifications: [],
          variants: []
        };

        if (!payload.name || !payload.description || !payload.category || payload.price < 0 || payload.stock < 0 || !payload.sku) {
          throw new Error('Missing or invalid required values');
        }

        await assertUniqueSkusForVendor(vendor._id, payload);
        await Product.create(payload);
        createdCount += 1;
      } catch (error) {
        failedRows.push({
          rowNumber: i + 2,
          title: row.title || '',
          reason: error.message || 'Unknown error'
        });
      }
    }

    const errorReportCsv = Papa.unparse(
      failedRows.map((row) => ({
        rowNumber: row.rowNumber,
        title: row.title,
        reason: row.reason
      }))
    );

    return res.status(200).json({
      success: true,
      data: {
        createdCount,
        failedRows,
        errorReportCsv
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorProductBarcode = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const product = await ensureVendorOwnsProduct(vendor, req.params.id);
    const sku = sanitizeText(req.query.sku || product.sku, 120);
    if (!sku) return res.status(400).json({ success: false, message: 'sku is required' });
    const svg = createBarcodeSvg(sku);
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.status(200).send(svg);
  } catch (error) {
    return next(error);
  }
};

exports.createStockAlertSubscription = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const payload = {
      vendorId: vendor._id,
      productId: toObjectId(req.body.productId),
      variantSku: sanitizeText(req.body.variantSku, 80),
      threshold: safeNumber(req.body.threshold, 5),
      active: req.body.active === undefined ? true : Boolean(req.body.active)
    };
    if (!payload.productId && !payload.variantSku) {
      return res.status(400).json({ success: false, message: 'productId or variantSku is required' });
    }
    const doc = await StockAlertSubscription.findOneAndUpdate(
      { vendorId: vendor._id, productId: payload.productId || null, variantSku: payload.variantSku || null },
      { $set: payload },
      { upsert: true, new: true }
    );
    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.listStockAlertSubscriptions = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const docs = await StockAlertSubscription.find({ vendorId: vendor._id }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: docs });
  } catch (error) {
    return next(error);
  }
};

exports.createStockReservation = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const product = await ensureVendorOwnsProduct(vendor, req.body.productId);
    const qty = Math.max(1, safeNumber(req.body.qty, 1));
    const sku = sanitizeText(req.body.sku, 80);
    const minutes = Math.min(120, Math.max(1, safeNumber(req.body.minutes, 15)));
    const currentStock = getVariantStock(product, sku);
    if (currentStock < qty) return res.status(400).json({ success: false, message: 'Insufficient stock for reservation' });

    setVariantStock(product, sku, currentStock - qty);
    await product.save();

    const reservation = await StockReservation.create({
      vendorId: vendor._id,
      productId: product._id,
      sku: sku || undefined,
      qty,
      expiresAt: new Date(Date.now() + minutes * 60000),
      status: 'ACTIVE'
    });
    return res.status(201).json({ success: true, data: reservation });
  } catch (error) {
    return next(error);
  }
};

exports.consumeStockReservation = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const reservation = await StockReservation.findById(req.params.reservationId);
    if (!reservation || String(reservation.vendorId) !== String(vendor._id)) {
      return res.status(404).json({ success: false, message: 'Reservation not found' });
    }
    if (reservation.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'Reservation is not active' });
    }
    reservation.status = 'CONSUMED';
    await reservation.save();
    return res.status(200).json({ success: true, data: reservation });
  } catch (error) {
    return next(error);
  }
};

exports.cancelVendorOrderItem = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    assertActiveVendor(vendor);

    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const item = (order.items || []).find((line) => {
      const itemProductId = String(line.productId || line.product);
      const itemVendorId = String(line.vendorId || line.vendor);
      return itemProductId === String(req.params.productId) && itemVendorId === String(vendor._id);
    });
    if (!item) return res.status(403).json({ success: false, message: 'Not authorized for this order item' });

    item.status = 'CANCELLED';
    item.updatedAt = new Date();
    item.vendorNotes = sanitizeText(req.body.reason || 'Cancelled by vendor', 500);

    const product = await Product.findById(item.productId || item.product);
    if (product && product.trackInventory) {
      const qty = safeNumber(item.qty || item.quantity, 0);
      const sku = sanitizeText(item.variant?.sku, 80);
      setVariantStock(product, sku, getVariantStock(product, sku) + qty);
      await product.save();
    }

    const nextOrderStatus = computeOverallOrderStatus(order.items);
    order.orderStatus = nextOrderStatus;
    order.status = mapOrderStatusToLegacy(nextOrderStatus);
    order.cancelledAt = new Date();
    await order.save();

    return res.status(200).json({ success: true, data: order });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorPackingSlipPdf = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const items = vendorItemsForOrder(order, vendor._id);
    if (!items.length) return res.status(403).json({ success: false, message: 'Not authorized for this order' });
    return await generateOrderSubsetPdf({ order, vendor, items, type: 'packing-slip', res });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorShippingLabelPdf = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const items = vendorItemsForOrder(order, vendor._id);
    if (!items.length) return res.status(403).json({ success: false, message: 'Not authorized for this order' });
    return await generateOrderSubsetPdf({ order, vendor, items, type: 'shipping-label', res });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorAnalyticsSummary = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const range = parseRangeQuery(req.query);
    const dateMatch = { createdAt: { $gte: range.from, $lte: range.to } };

    const [salesRows, ordersCount, repeatCustomersRows, topProducts, trafficRows] = await Promise.all([
      Order.aggregate([
        { $match: { ...dateMatch, 'items.vendor': vendor._id } },
        { $unwind: '$items' },
        { $match: { 'items.vendor': vendor._id, paymentStatus: { $in: ['PAID', 'paid', 'COMPLETED', 'completed'] } } },
        {
          $group: {
            _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, orderId: '$_id' },
            revenue: { $sum: { $ifNull: ['$items.lineTotal', '$items.subtotal'] } },
            units: { $sum: { $ifNull: ['$items.qty', '$items.quantity'] } },
            customerId: { $first: '$customerId' }
          }
        }
      ]),
      Order.countDocuments({ ...dateMatch, 'items.vendor': vendor._id }),
      Order.aggregate([
        { $match: { ...dateMatch, 'items.vendor': vendor._id } },
        { $group: { _id: '$customerId', orderCount: { $sum: 1 } } },
        { $match: { orderCount: { $gte: 2 } } },
        { $count: 'repeatCustomersCount' }
      ]),
      Order.aggregate([
        { $match: { ...dateMatch, 'items.vendor': vendor._id } },
        { $unwind: '$items' },
        { $match: { 'items.vendor': vendor._id } },
        {
          $group: {
            _id: '$items.productId',
            unitsSold: { $sum: { $ifNull: ['$items.qty', '$items.quantity'] } },
            revenue: { $sum: { $ifNull: ['$items.lineTotal', '$items.subtotal'] } }
          }
        },
        { $sort: { revenue: -1, unitsSold: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, unitsSold: 1, revenue: 1, name: '$product.name' } }
      ]),
      ProductAnalyticsEvent.aggregate([
        { $match: { ...dateMatch, vendorId: vendor._id } },
        { $group: { _id: '$eventType', count: { $sum: 1 } } }
      ])
    ]);

    const revenueByDayMap = new Map();
    let revenue = 0;
    let unitsSold = 0;
    for (const row of salesRows) {
      revenue += safeNumber(row.revenue, 0);
      unitsSold += safeNumber(row.units, 0);
      const day = row._id.day;
      const existing = revenueByDayMap.get(day) || { date: day, revenue: 0 };
      existing.revenue += safeNumber(row.revenue, 0);
      revenueByDayMap.set(day, existing);
    }

    const avgOrderValue = ordersCount > 0 ? revenue / ordersCount : 0;
    const traffic = {
      views: 0,
      clicks: 0,
      addToCart: 0,
      purchases: 0
    };
    for (const row of trafficRows) {
      if (row._id === 'VIEW') traffic.views = row.count;
      if (row._id === 'CLICK') traffic.clicks = row.count;
      if (row._id === 'ADD_TO_CART') traffic.addToCart = row.count;
      if (row._id === 'PURCHASE') traffic.purchases = row.count;
    }

    return res.status(200).json({
      success: true,
      data: {
        revenue: Number(revenue.toFixed(2)),
        totalOrders: ordersCount,
        unitsSold,
        avgOrderValue: Number(avgOrderValue.toFixed(2)),
        repeatCustomersCount: repeatCustomersRows[0]?.repeatCustomersCount || 0,
        revenueByDay: [...revenueByDayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
        topProducts,
        traffic
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorAnalyticsTraffic = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const range = parseRangeQuery(req.query);
    const dateMatch = { createdAt: { $gte: range.from, $lte: range.to } };

    const [events, sources] = await Promise.all([
      ProductAnalyticsEvent.aggregate([
        { $match: { ...dateMatch, vendorId: vendor._id } },
        { $group: { _id: '$eventType', count: { $sum: 1 } } }
      ]),
      ProductAnalyticsEvent.aggregate([
        { $match: { ...dateMatch, vendorId: vendor._id } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    const eventMap = { views: 0, clicks: 0, addToCart: 0, purchases: 0 };
    for (const row of events) {
      if (row._id === 'VIEW') eventMap.views = row.count;
      if (row._id === 'CLICK') eventMap.clicks = row.count;
      if (row._id === 'ADD_TO_CART') eventMap.addToCart = row.count;
      if (row._id === 'PURCHASE') eventMap.purchases = row.count;
    }

    return res.status(200).json({
      success: true,
      data: {
        ...eventMap,
        sources: sources.map((row) => ({ source: row._id, count: row.count }))
      }
    });
  } catch (error) {
    return next(error);
  }
};

function couponDiscount(total, coupon) {
  if (!coupon) return 0;
  if (coupon.discountType === 'PERCENT') return Math.max(0, Math.min(total, (total * coupon.amount) / 100));
  return Math.max(0, Math.min(total, coupon.amount));
}

async function getVendorPromoDocuments(vendorId) {
  const [coupons, bundles, flashSales, promotedListings] = await Promise.all([
    VendorCoupon.find({ vendorId }).sort({ createdAt: -1 }),
    ProductBundle.find({ vendorId }).sort({ createdAt: -1 }),
    FlashSale.find({ vendorId }).sort({ createdAt: -1 }),
    PromotedListing.find({ vendorId }).sort({ createdAt: -1 })
  ]);
  return { coupons, bundles, flashSales, promotedListings };
}

exports.getVendorMarketing = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const data = await getVendorPromoDocuments(vendor._id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

exports.createVendorCoupon = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const payload = req.body || {};
    const coupon = await VendorCoupon.create({
      vendorId: vendor._id,
      code: sanitizeText(payload.code, 40).toUpperCase(),
      discountType: payload.discountType,
      amount: safeNumber(payload.amount, 0),
      minSpend: safeNumber(payload.minSpend, 0),
      startAt: payload.startAt ? new Date(payload.startAt) : null,
      endAt: payload.endAt ? new Date(payload.endAt) : null,
      maxUses: safeNumber(payload.maxUses, 0),
      active: payload.active === undefined ? true : Boolean(payload.active)
    });
    return res.status(201).json({ success: true, data: coupon });
  } catch (error) {
    return next(error);
  }
};

exports.updateVendorCoupon = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const coupon = await VendorCoupon.findOne({ _id: req.params.id, vendorId: vendor._id });
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    Object.assign(coupon, req.body || {});
    await coupon.save();
    return res.status(200).json({ success: true, data: coupon });
  } catch (error) {
    return next(error);
  }
};

exports.createProductBundle = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const bundle = await ProductBundle.create({
      vendorId: vendor._id,
      title: sanitizeText(req.body.title, 160),
      productIds: Array.isArray(req.body.productIds) ? req.body.productIds : [],
      bundlePrice: req.body.bundlePrice === undefined ? undefined : safeNumber(req.body.bundlePrice, 0),
      discountPercent: req.body.discountPercent === undefined ? undefined : safeNumber(req.body.discountPercent, 0),
      active: req.body.active === undefined ? true : Boolean(req.body.active)
    });
    return res.status(201).json({ success: true, data: bundle });
  } catch (error) {
    return next(error);
  }
};

exports.createFlashSale = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const sale = await FlashSale.create({
      vendorId: vendor._id,
      productIds: Array.isArray(req.body.productIds) ? req.body.productIds : [],
      discount: safeNumber(req.body.discount, 0),
      startAt: new Date(req.body.startAt),
      endAt: new Date(req.body.endAt),
      active: req.body.active === undefined ? true : Boolean(req.body.active)
    });
    return res.status(201).json({ success: true, data: sale });
  } catch (error) {
    return next(error);
  }
};

exports.createPromotedListing = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const listing = await PromotedListing.create({
      vendorId: vendor._id,
      productId: req.body.productId,
      startAt: new Date(req.body.startAt),
      endAt: new Date(req.body.endAt),
      placement: req.body.placement,
      status: req.body.status || 'ACTIVE'
    });
    return res.status(201).json({ success: true, data: listing });
  } catch (error) {
    return next(error);
  }
};

exports.validateVendorCouponForCheckout = async (req, res, next) => {
  try {
    const { code, items } = req.body || {};
    const couponCode = sanitizeText(code, 40).toUpperCase();
    if (!couponCode) return res.status(400).json({ success: false, message: 'code is required' });
    const coupon = await VendorCoupon.findOne({ code: couponCode, active: true });
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });

    const now = new Date();
    if (coupon.startAt && coupon.startAt > now) return res.status(400).json({ success: false, message: 'Coupon not started yet' });
    if (coupon.endAt && coupon.endAt < now) return res.status(400).json({ success: false, message: 'Coupon expired' });
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
    }

    const vendorItems = Array.isArray(items) ? items.filter((item) => String(item.vendorId) === String(coupon.vendorId)) : [];
    const vendorSubtotal = vendorItems.reduce((sum, item) => sum + safeNumber(item.price, 0) * safeNumber(item.quantity, 0), 0);
    if (vendorSubtotal < coupon.minSpend) {
      return res.status(400).json({ success: false, message: `Minimum spend is ${coupon.minSpend}` });
    }
    const discount = Number(couponDiscount(vendorSubtotal, coupon).toFixed(2));
    return res.status(200).json({ success: true, data: { vendorId: coupon.vendorId, discount, code: coupon.code } });
  } catch (error) {
    return next(error);
  }
};

async function computeWalletSummary(vendorId) {
  const [completedCredits, completedDebits, pendingCredits, paidOutRows] = await Promise.all([
    VendorTransaction.aggregate([
      { $match: { vendorId, status: 'COMPLETED', direction: 'CREDIT' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    VendorTransaction.aggregate([
      { $match: { vendorId, status: 'COMPLETED', direction: 'DEBIT' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    VendorTransaction.aggregate([
      { $match: { vendorId, status: 'PENDING', direction: 'CREDIT' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    VendorTransaction.aggregate([
      { $match: { vendorId, status: 'COMPLETED', type: 'PAYOUT', direction: 'DEBIT' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ])
  ]);

  const credits = completedCredits[0]?.total || 0;
  const debits = completedDebits[0]?.total || 0;
  const pendingBalance = pendingCredits[0]?.total || 0;
  const availableBalance = Number((credits - debits).toFixed(2));
  const totalPaidOut = Number((paidOutRows[0]?.total || 0).toFixed(2));

  return { availableBalance, pendingBalance, totalPaidOut };
}

exports.getVendorWalletSummary = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const summary = await computeWalletSummary(vendor._id);
    return res.status(200).json({ success: true, data: summary });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorWalletTransactions = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const { page, limit, skip } = parsePagination(req.query, 20);
    const query = { vendorId: vendor._id };
    if (req.query.type) query.type = String(req.query.type).toUpperCase();
    if (req.query.dateFrom || req.query.dateTo) {
      query.createdAt = {};
      if (req.query.dateFrom) query.createdAt.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) query.createdAt.$lte = new Date(req.query.dateTo);
    }

    const [rows, total] = await Promise.all([
      VendorTransaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      VendorTransaction.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: rows
    });
  } catch (error) {
    return next(error);
  }
};

exports.requestVendorWithdraw = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const amount = safeNumber(req.body.amount, 0);
    if (amount <= 0) return res.status(400).json({ success: false, message: 'amount must be greater than 0' });

    const hasBankingDetails = Boolean(
      sanitizeText(vendor.bankDetails?.bankName, 120) &&
      sanitizeText(vendor.bankDetails?.accountNumber, 80) &&
      sanitizeText(vendor.bankDetails?.accountHolder || vendor.bankDetails?.accountHolderName, 120)
    );
    if (!hasBankingDetails) {
      return res.status(400).json({ success: false, message: 'Complete banking details before requesting payout' });
    }

    const summary = await computeWalletSummary(vendor._id);
    if (amount > summary.availableBalance) {
      return res.status(400).json({ success: false, message: 'Insufficient available balance' });
    }

    const request = await PayoutRequest.create({
      vendorId: vendor._id,
      amount,
      status: 'REQUESTED',
      requestedAt: new Date()
    });

    await VendorTransaction.create({
      vendorId: vendor._id,
      type: 'PAYOUT',
      direction: 'DEBIT',
      amount,
      reference: `PAYOUT-REQ-${request._id}`,
      description: 'Payout requested by vendor',
      status: 'PENDING',
      metadata: { payoutRequestId: request._id.toString() }
    });

    return res.status(201).json({ success: true, data: request });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorPayoutRequests = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const rows = await PayoutRequest.find({ vendorId: vendor._id }).sort({ requestedAt: -1 });
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return next(error);
  }
};

exports.adminApprovePayout = async (req, res, next) => {
  try {
    const payout = await PayoutRequest.findById(req.params.id);
    if (!payout) return res.status(404).json({ success: false, message: 'Payout request not found' });
    payout.status = 'APPROVED';
    payout.processedAt = new Date();
    payout.processedBy = req.user.id;
    payout.notes = sanitizeText(req.body.notes, 500);
    await payout.save();
    return res.status(200).json({ success: true, data: payout });
  } catch (error) {
    return next(error);
  }
};

exports.adminMarkPayoutPaid = async (req, res, next) => {
  try {
    const payout = await PayoutRequest.findById(req.params.id);
    if (!payout) return res.status(404).json({ success: false, message: 'Payout request not found' });
    payout.status = 'PAID';
    payout.processedAt = new Date();
    payout.processedBy = req.user.id;
    payout.notes = sanitizeText(req.body.notes, 500);
    await payout.save();

    const tx = await VendorTransaction.findOne({
      vendorId: payout.vendorId,
      type: 'PAYOUT',
      direction: 'DEBIT',
      status: 'PENDING',
      'metadata.payoutRequestId': String(payout._id)
    }).sort({ createdAt: -1 });
    if (tx) {
      tx.status = 'COMPLETED';
      await tx.save();
    }

    return res.status(200).json({ success: true, data: payout });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorReviews = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const { page, limit, skip } = parsePagination(req.query, 10);
    const sort = req.query.sort === 'highest' ? { rating: -1, createdAt: -1 } : req.query.sort === 'lowest' ? { rating: 1, createdAt: -1 } : { createdAt: -1 };

    const [reviews, total] = await Promise.all([
      Review.find({ targetType: 'VENDOR', vendorId: vendor._id, status: 'APPROVED' })
        .populate('reviewerId', 'name avatar')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Review.countDocuments({ targetType: 'VENDOR', vendorId: vendor._id, status: 'APPROVED' })
    ]);

    const replyRows = await ReviewReply.find({
      reviewId: { $in: reviews.map((review) => review._id) },
      vendorId: vendor._id
    });
    const replyMap = new Map(replyRows.map((reply) => [String(reply.reviewId), reply]));

    return res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: reviews.map((review) => ({
        ...review.toObject(),
        reply: replyMap.get(String(review._id)) || null
      }))
    });
  } catch (error) {
    return next(error);
  }
};

exports.replyToVendorReview = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const review = await Review.findById(req.params.reviewId).select('_id vendorId targetType');
    if (!review || review.targetType !== 'VENDOR' || String(review.vendorId) !== String(vendor._id)) {
      return res.status(404).json({ success: false, message: 'Review not found for this vendor' });
    }
    const message = sanitizeRichText(req.body.message, 1200);
    if (!message) return res.status(400).json({ success: false, message: 'message is required' });

    const reply = await ReviewReply.findOneAndUpdate(
      { reviewId: review._id, vendorId: vendor._id },
      { $set: { message } },
      { upsert: true, new: true }
    );
    return res.status(201).json({ success: true, data: reply });
  } catch (error) {
    return next(error);
  }
};

exports.deleteVendorReviewReply = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    await ReviewReply.deleteOne({ reviewId: req.params.reviewId, vendorId: vendor._id });
    return res.status(200).json({ success: true, message: 'Reply removed' });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorReviewSummary = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const rows = await Review.aggregate([
      { $match: { targetType: 'VENDOR', vendorId: vendor._id, status: 'APPROVED' } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          count: { $sum: 1 },
          r1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
          r2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          r3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          r4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          r5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } }
        }
      }
    ]);
    const summary = rows[0] || { avgRating: 0, count: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };
    return res.status(200).json({
      success: true,
      data: {
        avgRating: Number((summary.avgRating || 0).toFixed(2)),
        count: summary.count || 0,
        breakdown: { 1: summary.r1 || 0, 2: summary.r2 || 0, 3: summary.r3 || 0, 4: summary.r4 || 0, 5: summary.r5 || 0 }
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.reportVendorReview = async (req, res, next) => {
  try {
    const vendor = await requireVendor(req, res);
    if (!vendor) return;
    const review = await Review.findById(req.params.reviewId).select('_id vendorId targetType');
    if (!review || review.targetType !== 'VENDOR' || String(review.vendorId) !== String(vendor._id)) {
      return res.status(404).json({ success: false, message: 'Review not found for this vendor' });
    }
    const reason = sanitizeText(req.body.reason, 240);
    if (!reason) return res.status(400).json({ success: false, message: 'reason is required' });

    await ReviewReport.create({
      reviewId: review._id,
      reporterId: req.user.id,
      reason: reason.toLowerCase().replace(/\s+/g, '-')
    });
    return res.status(201).json({ success: true, message: 'Review reported to admin' });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: 'You already reported this review' });
    }
    return next(error);
  }
};

exports.runScheduledPublishing = async () => {
  const now = new Date();
  const products = await Product.find({
    status: PRODUCT_STATUS.PUBLISHED,
    isActive: false,
    scheduledPublishAt: { $lte: now }
  }).limit(100);
  for (const product of products) {
    product.isActive = true;
    await product.save();
  }
};

exports.releaseExpiredReservations = async () => {
  const now = new Date();
  const expired = await StockReservation.find({ status: 'ACTIVE', expiresAt: { $lte: now } }).limit(200);
  for (const reservation of expired) {
    const product = await Product.findById(reservation.productId);
    if (product) {
      const current = getVariantStock(product, reservation.sku);
      setVariantStock(product, reservation.sku, current + reservation.qty);
      await product.save();
    }
    reservation.status = 'EXPIRED';
    await reservation.save();
  }
};

exports.startVendorFeatureJobs = () => {
  if (jobsStarted) return;
  jobsStarted = true;
  setInterval(async () => {
    try {
      await exports.runScheduledPublishing();
      await exports.releaseExpiredReservations();
    } catch (error) {
      console.error('[vendor-jobs] failed', error.message);
    }
  }, 5 * 60 * 1000);
};
