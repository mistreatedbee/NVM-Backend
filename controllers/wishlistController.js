const mongoose = require('mongoose');
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 12));
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
    .select('_id name')
    .lean();
  if (!product) {
    const error = new Error('Product not available');
    error.statusCode = 404;
    throw error;
  }
  return product;
}

async function getOrCreateWishlist(userId) {
  let wishlist = await Wishlist.findOne({ userId });
  if (!wishlist) {
    wishlist = await Wishlist.create({ userId, productIds: [] });
  }
  return wishlist;
}

async function buildWishlistResponse({ userId, page, limit, skip }) {
  const wishlist = await Wishlist.findOne({ userId }).select('productIds').lean();
  const ids = wishlist?.productIds || [];
  const total = ids.length;
  const pageIds = ids.slice(skip, skip + limit);

  const products = pageIds.length
    ? await Product.find({ _id: { $in: pageIds }, status: 'PUBLISHED', isActive: true })
      .select('name title price images vendor category rating ratingAvg totalReviews slug status isActive')
      .populate('vendor', 'storeName slug')
      .populate('category', 'name slug')
      .lean()
    : [];

  const productMap = new Map(products.map((product) => [String(product._id), product]));
  const ordered = pageIds.map((id) => productMap.get(String(id))).filter(Boolean);

  return {
    success: true,
    data: ordered,
    productIds: ids.map(String),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit)
  };
}

exports.getWishlist = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const payload = await buildWishlistResponse({ userId: req.user.id, page, limit, skip });
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
};

exports.addWishlistItem = async (req, res, next) => {
  try {
    const { productId } = req.body || {};
    if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });

    await ensurePublishedProduct(productId);
    const wishlist = await getOrCreateWishlist(req.user.id);

    const idx = wishlist.productIds.findIndex((id) => String(id) === String(productId));
    if (idx >= 0) {
      wishlist.productIds.splice(idx, 1);
    }
    wishlist.productIds.unshift(productId);
    await wishlist.save();

    return res.status(200).json({
      success: true,
      message: 'Added to wishlist',
      count: wishlist.productIds.length,
      productIds: wishlist.productIds.map(String),
      isFavourite: true
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

exports.removeWishlistItem = async (req, res, next) => {
  try {
    const { productId } = req.body || {};
    if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });
    ensureProductId(productId);

    const wishlist = await getOrCreateWishlist(req.user.id);
    wishlist.productIds = wishlist.productIds.filter((id) => String(id) !== String(productId));
    await wishlist.save();

    return res.status(200).json({
      success: true,
      message: 'Removed from wishlist',
      count: wishlist.productIds.length,
      productIds: wishlist.productIds.map(String),
      isFavourite: false
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

exports.toggleWishlistItem = async (req, res, next) => {
  try {
    const { productId } = req.body || {};
    if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });
    ensureProductId(productId);

    const wishlist = await getOrCreateWishlist(req.user.id);
    const idx = wishlist.productIds.findIndex((id) => String(id) === String(productId));

    let isFavourite = false;
    if (idx >= 0) {
      wishlist.productIds.splice(idx, 1);
      isFavourite = false;
    } else {
      await ensurePublishedProduct(productId);
      wishlist.productIds.unshift(productId);
      isFavourite = true;
    }

    await wishlist.save();
    return res.status(200).json({
      success: true,
      count: wishlist.productIds.length,
      productIds: wishlist.productIds.map(String),
      isFavourite
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

exports.getWishlistCount = async (req, res, next) => {
  try {
    const wishlist = await Wishlist.findOne({ userId: req.user.id }).select('productIds').lean();
    return res.status(200).json({ success: true, count: wishlist?.productIds?.length || 0 });
  } catch (error) {
    return next(error);
  }
};
