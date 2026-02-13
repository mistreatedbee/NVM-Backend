const Review = require('../models/Review');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const Order = require('../models/Order');

function calculateReportCount(reports = []) {
  return reports.filter((report) => report.status === 'open').length;
}

// @desc    Create review
// @route   POST /api/reviews
// @access  Private (Customer)
exports.createReview = async (req, res, next) => {
  try {
    const { product, vendor, rating, title, comment, order, images, videos } = req.body;

    if (!product && !vendor) {
      return res.status(400).json({
        success: false,
        message: 'A review must target a product or a vendor'
      });
    }

    let targetProduct = null;
    let targetVendor = null;

    if (product) {
      targetProduct = await Product.findById(product);
      if (!targetProduct) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      const existingProductReview = await Review.findOne({
        product,
        customer: req.user.id
      });

      if (existingProductReview) {
        return res.status(400).json({
          success: false,
          message: 'You have already reviewed this product'
        });
      }

      targetVendor = targetProduct.vendor;
    }

    if (vendor) {
      const vendorExists = await Vendor.findById(vendor);
      if (!vendorExists) {
        return res.status(404).json({
          success: false,
          message: 'Vendor not found'
        });
      }

      targetVendor = vendorExists._id;

      if (!product) {
        const existingVendorReview = await Review.findOne({
          vendor,
          customer: req.user.id,
          $or: [{ product: { $exists: false } }, { product: null }]
        });

        if (existingVendorReview) {
          return res.status(400).json({
            success: false,
            message: 'You have already reviewed this vendor'
          });
        }
      }
    }

    let isVerifiedPurchase = false;
    if (order) {
      const customerOrder = await Order.findOne({
        _id: order,
        customer: req.user.id
      }).select('status items');

      if (!customerOrder) {
        return res.status(400).json({
          success: false,
          message: 'Order not found for this account'
        });
      }

      const hasMatchingItem = customerOrder.items.some((item) => {
        const productMatch = product ? String(item.product) === String(product) : true;
        const vendorMatch = targetVendor ? String(item.vendor) === String(targetVendor) : true;
        return productMatch && vendorMatch;
      });

      if (!hasMatchingItem) {
        return res.status(400).json({
          success: false,
          message: 'Order does not include this review target'
        });
      }

      isVerifiedPurchase = customerOrder.status === 'delivered';
    }

    const review = await Review.create({
      product: targetProduct?._id,
      vendor: targetVendor,
      customer: req.user.id,
      order,
      rating,
      title,
      comment,
      images: Array.isArray(images) ? images : [],
      videos: Array.isArray(videos) ? videos : [],
      isVerifiedPurchase
    });

    if (review.product) {
      await updateProductRating(review.product);
    }

    if (review.vendor) {
      await updateVendorRating(review.vendor);
    }

    res.status(201).json({
      success: true,
      data: review
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all reviews
// @route   GET /api/reviews
// @access  Public
exports.getAllReviews = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status === 'approved') {
      query.isApproved = true;
      query.isActive = true;
    }

    const reviews = await Review.find(query)
      .populate('customer', 'name avatar')
      .populate('product', 'name images')
      .populate('vendor', 'storeName')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);

    const total = await Review.countDocuments(query);

    res.status(200).json({
      success: true,
      count: reviews.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: reviews
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get product reviews
// @route   GET /api/reviews/product/:productId
// @access  Public
exports.getProductReviews = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const query = {
      product: req.params.productId,
      isApproved: true,
      isActive: true
    };

    if (req.query.rating) {
      query.rating = parseInt(req.query.rating, 10);
    }

    let sort = '-createdAt';
    if (req.query.sort === 'helpful') {
      sort = '-helpfulCount';
    } else if (req.query.sort === 'rating') {
      sort = '-rating';
    }

    const reviews = await Review.find(query)
      .populate('customer', 'name avatar')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Review.countDocuments(query);

    res.status(200).json({
      success: true,
      count: reviews.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: reviews
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get vendor reviews
// @route   GET /api/reviews/vendor/:vendorId
// @access  Public
exports.getVendorReviews = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const query = {
      vendor: req.params.vendorId,
      isApproved: true,
      isActive: true
    };

    const reviews = await Review.find(query)
      .populate('customer', 'name avatar')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);

    const total = await Review.countDocuments(query);

    res.status(200).json({
      success: true,
      count: reviews.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: reviews
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update review
// @route   PUT /api/reviews/:id
// @access  Private (Customer)
exports.updateReview = async (req, res, next) => {
  try {
    let review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    if (review.customer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this review'
      });
    }

    // Editing re-enters moderation queue.
    const updatePayload = {
      ...req.body,
      isApproved: true,
      moderatedBy: null,
      moderationReason: ''
    };

    review = await Review.findByIdAndUpdate(
      req.params.id,
      updatePayload,
      {
        new: true,
        runValidators: true
      }
    );

    if (review.product) {
      await updateProductRating(review.product);
    }
    if (review.vendor) {
      await updateVendorRating(review.vendor);
    }

    res.status(200).json({
      success: true,
      data: review
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete review
// @route   DELETE /api/reviews/:id
// @access  Private (Customer/Admin)
exports.deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    if (review.customer.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this review'
      });
    }

    await review.deleteOne();

    if (review.product) {
      await updateProductRating(review.product);
    }
    if (review.vendor) {
      await updateVendorRating(review.vendor);
    }

    res.status(200).json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add vendor response
// @route   PUT /api/reviews/:id/response
// @access  Private (Vendor)
exports.addVendorResponse = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    if (!review.vendor) {
      return res.status(400).json({
        success: false,
        message: 'This review is not attached to a vendor'
      });
    }

    const vendor = await Vendor.findById(review.vendor);
    if (!vendor || vendor.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    review.vendorResponse = {
      comment: req.body.comment,
      respondedAt: Date.now()
    };

    await review.save();

    res.status(200).json({
      success: true,
      data: review
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark review as helpful
// @route   PUT /api/reviews/:id/helpful
// @access  Private
exports.markHelpful = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    if (review.customer.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot vote your own review as helpful'
      });
    }

    const alreadyMarked = review.helpfulVotes.some((id) => id.toString() === req.user.id);

    if (alreadyMarked) {
      review.helpfulVotes = review.helpfulVotes.filter((id) => id.toString() !== req.user.id);
      review.helpfulCount = Math.max(0, review.helpfulCount - 1);
    } else {
      review.helpfulVotes.push(req.user.id);
      review.helpfulCount += 1;
    }

    await review.save();

    res.status(200).json({
      success: true,
      data: review
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Report review
// @route   POST /api/reviews/:id/report
// @access  Private
exports.reportReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    if (review.customer.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot report your own review'
      });
    }

    const alreadyReported = review.reports.some(
      (report) => report.reporter.toString() === req.user.id && report.status === 'open'
    );

    if (alreadyReported) {
      return res.status(400).json({
        success: false,
        message: 'You already have an open report for this review'
      });
    }

    review.reports.push({
      reporter: req.user.id,
      reason: req.body.reason,
      details: req.body.details
    });
    review.reportCount = calculateReportCount(review.reports);

    await review.save();

    res.status(201).json({
      success: true,
      message: 'Review reported successfully',
      data: review
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get reported reviews
// @route   GET /api/reviews/admin/reported
// @access  Private (Admin)
exports.getReportedReviews = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const reportStatus = req.query.reportStatus || 'open';
    const query = reportStatus === 'all'
      ? { reportCount: { $gt: 0 } }
      : { reports: { $elemMatch: { status: reportStatus } } };

    const reviews = await Review.find(query)
      .populate('customer', 'name email')
      .populate('product', 'name')
      .populate('vendor', 'storeName')
      .populate('reports.reporter', 'name email')
      .sort('-reportCount -createdAt')
      .skip(skip)
      .limit(limit);

    const total = await Review.countDocuments(query);

    res.status(200).json({
      success: true,
      count: reviews.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: reviews
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Moderate review
// @route   PUT /api/reviews/:id/moderate
// @access  Private (Admin)
exports.moderateReview = async (req, res, next) => {
  try {
    const { action, reason } = req.body;
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    review.moderatedBy = req.user.id;
    review.moderationReason = reason || '';

    if (action === 'approve' || action === 'restore') {
      review.isApproved = true;
      review.isActive = true;
    } else if (action === 'reject') {
      review.isApproved = false;
      review.isActive = false;
    } else if (action === 'resolve-reports' || action === 'dismiss-reports') {
      review.reports = review.reports.map((report) => {
        if (report.status !== 'open') {
          return report;
        }

        return {
          ...report.toObject(),
          status: action === 'resolve-reports' ? 'resolved' : 'dismissed',
          handledBy: req.user.id,
          handledAt: new Date()
        };
      });
      review.reportCount = calculateReportCount(review.reports);
    }

    await review.save();

    if (review.product) {
      await updateProductRating(review.product);
    }
    if (review.vendor) {
      await updateVendorRating(review.vendor);
    }

    res.status(200).json({
      success: true,
      data: review
    });
  } catch (error) {
    next(error);
  }
};

// Helper functions
async function updateProductRating(productId) {
  const reviews = await Review.find({
    product: productId,
    isApproved: true,
    isActive: true
  }).select('rating');

  const totalReviews = reviews.length;
  const avgRating = totalReviews > 0
    ? reviews.reduce((acc, review) => acc + review.rating, 0) / totalReviews
    : 0;

  await Product.findByIdAndUpdate(productId, {
    rating: avgRating,
    totalReviews
  });
}

async function updateVendorRating(vendorId) {
  const reviews = await Review.find({
    vendor: vendorId,
    isApproved: true,
    isActive: true
  }).select('rating');

  const totalReviews = reviews.length;
  const avgRating = totalReviews > 0
    ? reviews.reduce((acc, review) => acc + review.rating, 0) / totalReviews
    : 0;
  const qualifiesTopRated = totalReviews >= 10 && avgRating >= 4.5;

  await Vendor.findByIdAndUpdate(vendorId, {
    rating: avgRating,
    totalReviews,
    topRatedBadge: qualifiesTopRated,
    topRatedSince: qualifiesTopRated ? new Date() : null
  });
}
