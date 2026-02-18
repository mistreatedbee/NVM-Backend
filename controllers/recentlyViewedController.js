const mongoose = require('mongoose');
const RecentlyViewed = require('../models/RecentlyViewed');
const Product = require('../models/Product');

const MAX_ITEMS = 20;

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(30, Math.max(1, parseInt(query.limit, 10) || 8));
  return { page, limit, skip: (page - 1) * limit };
}

function ensureProductId(productId) {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    const error = new Error('Invalid productId');
    error.statusCode = 400;
    throw error;
  }
}

async function ensurePublishedProduct(productId) {
  ensureProductId(productId);
  const product = await Product.findOne({ _id: productId, status: 'PUBLISHED', isActive: true })
    .select('_id')
    .lean();
  if (!product) {
    const error = new Error('Product not available');
    error.statusCode = 404;
    throw error;
  }
  return product;
}

async function getOrCreateRecentlyViewed(userId) {
  let record = await RecentlyViewed.findOne({ userId });
  if (!record) {
    record = await RecentlyViewed.create({ userId, items: [] });
  }
  return record;
}

exports.getRecentlyViewed = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const record = await RecentlyViewed.findOne({ userId: req.user.id }).select('items updatedAt').lean();
    const items = record?.items || [];
    const total = items.length;
    const pageItems = items.slice(skip, skip + limit);
    const pageIds = pageItems.map((item) => item.productId);

    const products = pageIds.length
      ? await Product.find({ _id: { $in: pageIds }, status: 'PUBLISHED', isActive: true })
        .select('name title price images vendor category rating ratingAvg totalReviews slug status isActive')
        .populate('vendor', 'storeName slug')
        .populate('category', 'name slug')
        .lean()
      : [];

    const productMap = new Map(products.map((product) => [String(product._id), product]));
    const data = pageItems
      .map((item) => {
        const product = productMap.get(String(item.productId));
        if (!product) return null;
        return {
          product,
          viewedAt: item.viewedAt
        };
      })
      .filter(Boolean);

    return res.status(200).json({
      success: true,
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      updatedAt: record?.updatedAt || null
    });
  } catch (error) {
    return next(error);
  }
};

exports.trackRecentlyViewed = async (req, res, next) => {
  try {
    const { productId } = req.body || {};
    if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });

    await ensurePublishedProduct(productId);

    const record = await getOrCreateRecentlyViewed(req.user.id);
    record.items = record.items.filter((item) => String(item.productId) !== String(productId));
    record.items.unshift({ productId, viewedAt: new Date() });

    if (record.items.length > MAX_ITEMS) {
      record.items = record.items.slice(0, MAX_ITEMS);
    }

    await record.save();

    return res.status(200).json({
      success: true,
      count: record.items.length,
      updatedAt: record.updatedAt
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
};
