const mongoose = require('mongoose');
const Review = require('../models/Review');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const Order = require('../models/Order');
const HelpfulVote = require('../models/HelpfulVote');
const ReviewReport = require('../models/ReviewReport');
const { logActivity, logAudit, resolveIp } = require('../services/loggingService');

const ALLOWED_SORT = new Set(['newest', 'highest', 'lowest', 'helpful']);
const REVIEW_EDIT_WINDOW_DAYS = 30;

function toObjectId(id) {
  return new mongoose.Types.ObjectId(id);
}

function sanitizeText(input = '') {
  return String(input)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
  return { page, limit, skip: (page - 1) * limit };
}

function parseSort(sort) {
  if (!ALLOWED_SORT.has(sort)) {
    return { createdAt: -1 };
  }
  if (sort === 'highest') return { rating: -1, createdAt: -1 };
  if (sort === 'lowest') return { rating: 1, createdAt: -1 };
  if (sort === 'helpful') return { helpfulCount: -1, createdAt: -1 };
  return { createdAt: -1 };
}

function ensureCustomer(req, res) {
  if (!req.user || req.user.role !== 'customer') {
    res.status(403).json({
      success: false,
      message: 'Only customers can perform this action'
    });
    return false;
  }
  return true;
}

function isPaidOrCompleted(order) {
  const paymentStatus = String(order.paymentStatus || '').toLowerCase();
  const status = String(order.status || '').toLowerCase();
  const orderStatus = String(order.orderStatus || '').toUpperCase();
  return (
    paymentStatus === 'paid' ||
    paymentStatus === 'completed' ||
    status === 'delivered' ||
    status === 'confirmed' ||
    orderStatus === 'DELIVERED'
  );
}

function orderContainsTarget({ order, productId, vendorId }) {
  return (order.items || []).some((item) => {
    const itemProduct = String(item.product || item.productId || '');
    const itemVendor = String(item.vendor || item.vendorId || '');
    if (productId && itemProduct !== String(productId)) return false;
    if (vendorId && itemVendor !== String(vendorId)) return false;
    return true;
  });
}

async function isVerifiedPurchase({ reviewerId, productId, vendorId, orderId }) {
  if (orderId) {
    const order = await Order.findOne({
      _id: orderId,
      $or: [{ customer: reviewerId }, { customerId: reviewerId }]
    }).select('_id paymentStatus status orderStatus items');

    if (!order) {
      return { verified: false, orderId: null, invalidOrderReference: true };
    }
    if (!orderContainsTarget({ order, productId, vendorId })) {
      return { verified: false, orderId: null, invalidOrderReference: true };
    }

    return {
      verified: isPaidOrCompleted(order),
      orderId: order._id,
      invalidOrderReference: false
    };
  }

  const orders = await Order.find({
    $or: [{ customer: reviewerId }, { customerId: reviewerId }]
  }).select('_id paymentStatus status orderStatus items');

  for (const order of orders) {
    if (!isPaidOrCompleted(order)) continue;
    if (!orderContainsTarget({ order, productId, vendorId })) continue;
    return { verified: true, orderId: order._id, invalidOrderReference: false };
  }
  return { verified: false, orderId: null, invalidOrderReference: false };
}

async function recomputeProductRating(productId) {
  if (!productId) return;
  const [summary] = await Review.aggregate([
    {
      $match: {
        targetType: 'PRODUCT',
        productId: toObjectId(productId),
        status: 'APPROVED'
      }
    },
    {
      $group: {
        _id: '$productId',
        ratingAvg: { $avg: '$rating' },
        ratingCount: { $sum: 1 }
      }
    }
  ]);

  const ratingAvg = Number((summary?.ratingAvg || 0).toFixed(2));
  const ratingCount = summary?.ratingCount || 0;
  await Product.findByIdAndUpdate(productId, {
    ratingAvg,
    ratingCount,
    rating: ratingAvg,
    totalReviews: ratingCount
  });
}

async function recomputeVendorRating(vendorId) {
  if (!vendorId) return;
  const [summary] = await Review.aggregate([
    {
      $match: {
        targetType: 'VENDOR',
        vendorId: toObjectId(vendorId),
        status: 'APPROVED'
      }
    },
    {
      $group: {
        _id: '$vendorId',
        ratingAvg: { $avg: '$rating' },
        ratingCount: { $sum: 1 }
      }
    }
  ]);

  const ratingAvg = Number((summary?.ratingAvg || 0).toFixed(2));
  const ratingCount = summary?.ratingCount || 0;
  await Vendor.findByIdAndUpdate(vendorId, {
    vendorRatingAvg: ratingAvg,
    vendorRatingCount: ratingCount,
    rating: ratingAvg,
    totalReviews: ratingCount,
    topRatedBadge: ratingCount >= 10 && ratingAvg >= 4.5,
    topRatedSince: ratingCount >= 10 && ratingAvg >= 4.5 ? new Date() : null
  });
}

async function refreshTargetRating(review) {
  if (review.targetType === 'PRODUCT' && review.productId) {
    await recomputeProductRating(review.productId);
  }
  if (review.targetType === 'VENDOR' && review.vendorId) {
    await recomputeVendorRating(review.vendorId);
  }
}

function normalizeReviewPayload(reviewDoc) {
  const obj = reviewDoc.toObject ? reviewDoc.toObject() : reviewDoc;
  return {
    ...obj,
    comment: obj.body,
    customer: obj.reviewerId,
    product: obj.productId,
    vendor: obj.vendorId,
    order: obj.orderId,
    isVerifiedPurchase: obj.verifiedPurchase,
    isApproved: obj.status === 'APPROVED'
  };
}

async function ensureTargetExists({ targetType, productId, vendorId }) {
  if (targetType === 'PRODUCT') {
    if (!productId) return { ok: false, message: 'productId is required for product reviews' };
    const product = await Product.findById(productId).select('_id vendor');
    if (!product) return { ok: false, message: 'Product not found' };
    return { ok: true, productId: product._id, vendorId: product.vendor };
  }

  if (!vendorId) return { ok: false, message: 'vendorId is required for vendor reviews' };
  const vendor = await Vendor.findById(vendorId).select('_id');
  if (!vendor) return { ok: false, message: 'Vendor not found' };
  return { ok: true, vendorId: vendor._id };
}

function isDuplicateKeyError(error) {
  return error && error.code === 11000;
}

// @desc    Create review
// @route   POST /api/reviews
// @access  Private (Customer)
exports.createReview = async (req, res, next) => {
  try {
    if (!ensureCustomer(req, res)) return;

    const inferredTargetType = req.body.targetType || (req.body.product || req.body.productId ? 'PRODUCT' : 'VENDOR');
    const targetType = inferredTargetType;
    if (!['PRODUCT', 'VENDOR'].includes(targetType)) {
      return res.status(400).json({ success: false, message: 'targetType must be PRODUCT or VENDOR' });
    }

    const targetCheck = await ensureTargetExists({
      targetType,
      productId: req.body.productId || req.body.product,
      vendorId: req.body.vendorId || req.body.vendor
    });
    if (!targetCheck.ok) {
      return res.status(404).json({ success: false, message: targetCheck.message });
    }

    const body = sanitizeText(req.body.body || req.body.comment || '');
    const title = sanitizeText(req.body.title || '');
    if (!body || body.length < 10) {
      return res.status(400).json({ success: false, message: 'Review body must be at least 10 characters' });
    }

    const verification = await isVerifiedPurchase({
      reviewerId: req.user.id,
      productId: targetType === 'PRODUCT' ? targetCheck.productId : undefined,
      vendorId: targetType === 'VENDOR' ? targetCheck.vendorId : undefined,
      orderId: req.body.orderId || req.body.order
    });
    if (verification.invalidOrderReference) {
      return res.status(400).json({
        success: false,
        message: 'orderId is invalid for this reviewer/target'
      });
    }

    const legacyImages = Array.isArray(req.body.images) ? req.body.images.map((img) => ({ url: img.url, type: 'IMAGE' })) : [];
    const legacyVideos = Array.isArray(req.body.videos) ? req.body.videos.map((video) => ({ url: video.url, type: 'VIDEO' })) : [];

    const payload = {
      reviewerId: req.user.id,
      targetType,
      productId: targetType === 'PRODUCT' ? targetCheck.productId : undefined,
      vendorId: targetType === 'VENDOR' ? targetCheck.vendorId : undefined,
      orderId: verification.orderId || undefined,
      rating: Number(req.body.rating),
      title,
      body,
      media: Array.isArray(req.body.media) ? req.body.media : [...legacyImages, ...legacyVideos],
      verifiedPurchase: verification.verified,
      status: 'APPROVED'
    };

    const review = await Review.create(payload);
    await logActivity({
      userId: req.user.id,
      role: req.user.role,
      action: 'REVIEW_CREATED',
      entityType: 'REVIEW',
      entityId: review._id,
      metadata: {
        targetType: review.targetType,
        productId: review.productId || null,
        vendorId: review.vendorId || null
      },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
    });
    await refreshTargetRating(review);

    return res.status(201).json({
      success: true,
      data: normalizeReviewPayload(review)
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate review detected for this target/order'
      });
    }
    return next(error);
  }
};

// @desc    Get all reviews (public approved only)
// @route   GET /api/reviews
// @access  Public
exports.getAllReviews = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const sort = parseSort(req.query.sort || 'newest');
    const query = { status: 'APPROVED' };

    const [reviews, total] = await Promise.all([
      Review.find(query)
        .populate('reviewerId', 'name avatar')
        .populate('productId', 'name images')
        .populate('vendorId', 'storeName')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Review.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      count: reviews.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: reviews.map(normalizeReviewPayload)
    });
  } catch (error) {
    return next(error);
  }
};

async function listTargetReviews({ req, res, targetType, targetField, targetId }) {
  const { page, limit, skip } = parsePagination(req.query);
  const sort = parseSort(req.query.sort || 'newest');
  const query = {
    targetType,
    [targetField]: targetId,
    status: 'APPROVED'
  };
  if (req.query.rating) {
    query.rating = Number(req.query.rating);
  }

  const [reviews, total] = await Promise.all([
    Review.find(query)
      .populate('reviewerId', 'name avatar')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Review.countDocuments(query)
  ]);

  return res.status(200).json({
    success: true,
    count: reviews.length,
    total,
    pages: Math.ceil(total / limit),
    currentPage: page,
    data: reviews.map(normalizeReviewPayload)
  });
}

// @desc    Get product reviews
// @route   GET /api/reviews/product/:productId
// @access  Public
exports.getProductReviews = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.productId).select('_id');
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    return await listTargetReviews({
      req,
      res,
      targetType: 'PRODUCT',
      targetField: 'productId',
      targetId: product._id
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Get vendor reviews
// @route   GET /api/reviews/vendor/:vendorId
// @access  Public
exports.getVendorReviews = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.vendorId).select('_id');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    return await listTargetReviews({
      req,
      res,
      targetType: 'VENDOR',
      targetField: 'vendorId',
      targetId: vendor._id
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Product route alias for reviews
// @route   GET /api/products/:productId/reviews
// @access  Public
exports.getProductReviewsByProduct = exports.getProductReviews;

// @desc    Vendor route alias for reviews
// @route   GET /api/vendors/:vendorId/reviews
// @access  Public
exports.getVendorReviewsByVendor = exports.getVendorReviews;

// @desc    Update review
// @route   PUT /api/reviews/:id
// @access  Private (Customer owner)
exports.updateReview = async (req, res, next) => {
  try {
    if (!ensureCustomer(req, res)) return;

    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    if (String(review.reviewerId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this review' });
    }

    const editDeadline = new Date(review.createdAt);
    editDeadline.setDate(editDeadline.getDate() + REVIEW_EDIT_WINDOW_DAYS);
    if (new Date() > editDeadline) {
      return res.status(400).json({
        success: false,
        message: `Review edit window (${REVIEW_EDIT_WINDOW_DAYS} days) has expired`
      });
    }

    if (req.body.rating !== undefined) review.rating = Number(req.body.rating);
    if (req.body.title !== undefined) review.title = sanitizeText(req.body.title || '');
    if (req.body.body !== undefined) review.body = sanitizeText(req.body.body || '');
    if (req.body.media !== undefined && Array.isArray(req.body.media)) review.media = req.body.media;

    await review.save();
    await refreshTargetRating(review);

    return res.status(200).json({
      success: true,
      data: normalizeReviewPayload(review)
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Delete review
// @route   DELETE /api/reviews/:id
// @access  Private (Customer owner/Admin)
exports.deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    const isOwner = String(review.reviewerId) === String(req.user.id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this review' });
    }

    await Review.deleteOne({ _id: review._id });
    await HelpfulVote.deleteMany({ reviewId: review._id });
    await ReviewReport.deleteMany({ reviewId: review._id });
    await refreshTargetRating(review);

    return res.status(200).json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Toggle helpful vote
// @route   POST /api/reviews/:id/helpful
// @access  Private
exports.markHelpful = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    if (String(review.reviewerId) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: 'You cannot vote your own review as helpful' });
    }

    const existing = await HelpfulVote.findOne({ reviewId: review._id, userId: req.user.id });
    let helpful = false;
    if (existing) {
      await HelpfulVote.deleteOne({ _id: existing._id });
    } else {
      await HelpfulVote.create({ reviewId: review._id, userId: req.user.id });
      helpful = true;
    }

    const helpfulCount = await HelpfulVote.countDocuments({ reviewId: review._id });
    review.helpfulCount = helpfulCount;
    await review.save();

    return res.status(200).json({
      success: true,
      data: { reviewId: review._id, helpfulCount, helpful }
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Report review
// @route   POST /api/reviews/:id/report
// @access  Private
exports.reportReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    if (String(review.reviewerId) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: 'You cannot report your own review' });
    }

    const reason = req.body.reason;
    await ReviewReport.create({
      reviewId: review._id,
      reporterId: req.user.id,
      reason
    });

    review.reportedCount = await ReviewReport.countDocuments({ reviewId: review._id });
    await review.save();

    return res.status(201).json({
      success: true,
      message: 'Review reported successfully',
      data: { reviewId: review._id, reportedCount: review.reportedCount }
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({
        success: false,
        message: 'You already reported this review'
      });
    }
    return next(error);
  }
};

async function logAdminReviewAction({ req, review, action, reason }) {
  return logAudit({
    actorAdminId: req.user.id,
    actionType: action,
    targetType: 'REVIEW',
    targetId: review._id,
    reason: reason || '',
    metadata: {
      reviewId: review._id.toString(),
      reason: reason || null,
      targetType: review.targetType,
      productId: review.productId ? review.productId.toString() : null,
      vendorId: review.vendorId ? review.vendorId.toString() : null
    },
    ipAddress: resolveIp(req),
    userAgent: req.headers['user-agent'] || ''
  });
}

// @desc    Admin list reviews
// @route   GET /api/admin/reviews
// @access  Private (Admin)
exports.getAdminReviews = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};
    const q = sanitizeText(req.query.q || '');

    if (req.query.targetType && ['PRODUCT', 'VENDOR'].includes(req.query.targetType)) {
      query.targetType = req.query.targetType;
    }
    if (req.query.status && req.query.status !== 'all') {
      if (req.query.status === 'REPORTED') {
        query.reportedCount = { $gt: 0 };
      } else {
        query.status = req.query.status;
      }
    }
    if (String(req.query.reportedOnly || '').toLowerCase() === 'true') {
      query.reportedCount = { $gt: 0 };
    }
    if (q) {
      query.$or = [{ title: { $regex: q, $options: 'i' } }, { body: { $regex: q, $options: 'i' } }];
    }

    const [reviews, total] = await Promise.all([
      Review.find(query)
        .populate('reviewerId', 'name email')
        .populate('productId', 'name')
        .populate('vendorId', 'storeName')
        .populate('orderId', 'orderNumber')
        .sort({ reportedCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      count: reviews.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: reviews.map(normalizeReviewPayload)
    });
  } catch (error) {
    return next(error);
  }
};

async function moderateReviewStatus({ req, res, reviewId, nextStatus, actionType, requireReason = false }) {
  const targetReviewId = reviewId || req.params.reviewId || req.params.id;
  const review = await Review.findById(targetReviewId);
  if (!review) {
    return res.status(404).json({ success: false, message: 'Review not found' });
  }

  const reason = sanitizeText(req.body.reason || '');
  if (requireReason && !reason) {
    return res.status(400).json({ success: false, message: 'reason is required' });
  }

  review.status = nextStatus;
  review.moderation = {
    reason: reason || undefined,
    moderatedBy: req.user.id,
    moderatedAt: new Date()
  };
  await review.save();

  await refreshTargetRating(review);
  await logAdminReviewAction({ req, review, action: actionType, reason });

  return res.status(200).json({ success: true, data: normalizeReviewPayload(review) });
}

// @desc    Admin approve review
// @route   PATCH /api/admin/reviews/:reviewId/approve
// @access  Private (Admin)
exports.approveReview = async (req, res, next) => {
  try {
    return await moderateReviewStatus({
      req,
      res,
      reviewId: req.params.reviewId || req.params.id,
      nextStatus: 'APPROVED',
      actionType: 'REVIEW_APPROVE'
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Admin reject review
// @route   PATCH /api/admin/reviews/:reviewId/reject
// @access  Private (Admin)
exports.rejectReview = async (req, res, next) => {
  try {
    return await moderateReviewStatus({
      req,
      res,
      reviewId: req.params.reviewId || req.params.id,
      nextStatus: 'REJECTED',
      actionType: 'REVIEW_REJECT',
      requireReason: true
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Admin hide review
// @route   PATCH /api/admin/reviews/:reviewId/hide
// @access  Private (Admin)
exports.hideReview = async (req, res, next) => {
  try {
    return await moderateReviewStatus({
      req,
      res,
      reviewId: req.params.reviewId || req.params.id,
      nextStatus: 'HIDDEN',
      actionType: 'REVIEW_HIDE',
      requireReason: true
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Admin delete review
// @route   DELETE /api/admin/reviews/:reviewId
// @access  Private (Admin)
exports.adminDeleteReview = async (req, res, next) => {
  try {
    const reason = sanitizeText(req.body?.reason || '');
    if (!reason) {
      return res.status(400).json({ success: false, message: 'reason is required' });
    }

    const review = await Review.findById(req.params.reviewId || req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    await Review.deleteOne({ _id: review._id });
    await HelpfulVote.deleteMany({ reviewId: review._id });
    await ReviewReport.deleteMany({ reviewId: review._id });
    await refreshTargetRating(review);
    await logAdminReviewAction({
      req,
      review,
      action: 'REVIEW_DELETE',
      reason
    });

    return res.status(200).json({ success: true, message: 'Review deleted' });
  } catch (error) {
    return next(error);
  }
};

// Legacy compatibility wrappers
exports.getReportedReviews = exports.getAdminReviews;
exports.moderateReview = async (req, res, next) => {
  try {
    const action = req.body.action;
    if (action === 'approve' || action === 'restore') return exports.approveReview(req, res, next);
    if (action === 'reject') return exports.rejectReview(req, res, next);
    if (action === 'hide') return exports.hideReview(req, res, next);
    return res.status(400).json({ success: false, message: 'Unsupported moderation action' });
  } catch (error) {
    return next(error);
  }
};

exports.addVendorResponse = async (_req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Vendor responses are no longer supported for this review flow'
  });
};

exports.isVerifiedPurchase = isVerifiedPurchase;
exports.recomputeProductRating = recomputeProductRating;
exports.recomputeVendorRating = recomputeVendorRating;
