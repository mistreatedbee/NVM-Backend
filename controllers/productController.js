const Product = require('../models/Product');
const Vendor = require('../models/Vendor');

const PUBLIC_VISIBLE_STATUSES = ['active', 'out-of-stock'];

function addProductActivityLog(product, { action, message, metadata, performedBy, performedByRole }) {
  if (!Array.isArray(product.activityLogs)) {
    product.activityLogs = [];
  }

  product.activityLogs.unshift({
    action,
    message,
    metadata,
    performedBy,
    performedByRole
  });

  if (product.activityLogs.length > 200) {
    product.activityLogs = product.activityLogs.slice(0, 200);
  }
}

function calculateReportCount(reports = []) {
  return reports.filter((report) => report.status === 'open').length;
}

// @desc    Create product
// @route   POST /api/products
// @access  Private (Vendor)
exports.createProduct = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user.id });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }

    if (vendor.status !== 'approved' || vendor.accountStatus !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Vendor must be approved and active to create products'
      });
    }

    const activeProductCount = await Product.countDocuments({ vendor: vendor._id, isActive: true });
    if (activeProductCount >= 2) {
      return res.status(403).json({
        success: false,
        message: 'Product limit reached: you can only add 2 products at the moment'
      });
    }

    const product = await Product.create({
      ...req.body,
      vendor: vendor._id,
      status: req.body.status || 'draft',
      isApproved: false,
      moderationStatus: 'pending',
      moderationHistory: [{
        action: 'submitted',
        reason: 'Submitted for moderation',
        performedBy: req.user.id,
        performedByRole: req.user.role
      }]
    });

    addProductActivityLog(product, {
      action: 'product.created',
      message: 'Product created and submitted for moderation',
      performedBy: req.user.id,
      performedByRole: req.user.role
    });
    await product.save();

    vendor.totalProducts += 1;
    await vendor.save();

    res.status(201).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all products
// @route   GET /api/products
// @access  Public
exports.getAllProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;
    const skip = (page - 1) * limit;

    const query = {
      status: { $in: PUBLIC_VISIBLE_STATUSES },
      isActive: true,
      isApproved: true,
      moderationStatus: 'approved'
    };

    if (req.query.category) {
      query.category = req.query.category;
    }
    if (req.query.vendor) {
      query.vendor = req.query.vendor;
    }
    if (req.query.type) {
      query.productType = req.query.type;
    }
    if (req.query.minPrice || req.query.maxPrice) {
      query.price = {};
      if (req.query.minPrice) {
        query.price.$gte = parseFloat(req.query.minPrice);
      }
      if (req.query.maxPrice) {
        query.price.$lte = parseFloat(req.query.maxPrice);
      }
    }
    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }

    let sort = '-createdAt';
    if (req.query.sort === 'price-asc') {
      sort = 'price';
    } else if (req.query.sort === 'price-desc') {
      sort = '-price';
    } else if (req.query.sort === 'rating') {
      sort = '-rating';
    } else if (req.query.sort === 'popular') {
      sort = '-totalSales';
    }

    const products = await Product.find(query)
      .populate('vendor', 'storeName slug logo rating')
      .populate('category', 'name slug')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Product.countDocuments(query);

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

// @desc    Get my products (vendor)
// @route   GET /api/products/my
// @access  Private (Vendor)
exports.getMyProducts = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user.id });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const query = { vendor: vendor._id, isActive: true };
    if (req.query.status && req.query.status !== 'all') {
      query.status = req.query.status;
    }
    if (req.query.moderationStatus && req.query.moderationStatus !== 'all') {
      query.moderationStatus = req.query.moderationStatus;
    }

    const products = await Product.find(query)
      .populate('category', 'name slug')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);

    const total = await Product.countDocuments(query);

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

// @desc    Get all products (admin)
// @route   GET /api/products/admin
// @access  Private (Admin)
exports.getAdminProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 100;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status && req.query.status !== 'all') {
      query.status = req.query.status;
    }
    if (req.query.moderationStatus && req.query.moderationStatus !== 'all') {
      query.moderationStatus = req.query.moderationStatus;
    }
    if (req.query.reported === 'true') {
      query.reportCount = { $gt: 0 };
    }

    const products = await Product.find(query)
      .populate('vendor', 'storeName slug logo rating')
      .populate('category', 'name slug')
      .populate('moderatedBy', 'name email')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);

    const total = await Product.countDocuments(query);

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

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
exports.getProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('vendor', 'storeName slug logo rating totalReviews')
      .populate('category', 'name slug');

    if (!product || !product.isActive || !product.isApproved) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.views += 1;
    await product.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get product by slug
// @route   GET /api/products/slug/:slug
// @access  Public
exports.getProductBySlug = async (req, res, next) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug })
      .populate('vendor', 'storeName slug logo rating totalReviews')
      .populate('category', 'name slug');

    if (!product || !product.isActive || !product.isApproved) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.views += 1;
    await product.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private (Vendor/Admin)
exports.updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const vendor = await Vendor.findById(product.vendor);
    if (!vendor || (vendor.user.toString() !== req.user.id && req.user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this product'
      });
    }

    Object.assign(product, req.body);

    if (req.user.role !== 'admin') {
      product.isApproved = false;
      product.moderationStatus = 'pending';
      product.moderatedBy = undefined;
      product.moderationReason = '';
      product.moderatedAt = undefined;
      product.moderationHistory.push({
        action: 'resubmitted',
        reason: 'Vendor resubmitted product after edits',
        performedBy: req.user.id,
        performedByRole: req.user.role
      });
    }

    addProductActivityLog(product, {
      action: req.user.role === 'admin' ? 'product.updated.by-admin' : 'product.updated.by-vendor',
      message: 'Product updated',
      metadata: { updatedFields: Object.keys(req.body || {}) },
      performedBy: req.user.id,
      performedByRole: req.user.role
    });

    await product.save();

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete product (soft delete)
// @route   DELETE /api/products/:id
// @access  Private (Vendor/Admin)
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const vendor = await Vendor.findById(product.vendor);
    if (!vendor || (vendor.user.toString() !== req.user.id && req.user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this product'
      });
    }

    product.isActive = false;
    product.status = 'inactive';
    addProductActivityLog(product, {
      action: req.user.role === 'admin' ? 'product.deleted.by-admin' : 'product.deleted.by-vendor',
      message: 'Product soft-deleted',
      performedBy: req.user.id,
      performedByRole: req.user.role
    });
    await product.save();

    vendor.totalProducts = Math.max(0, vendor.totalProducts - 1);
    await vendor.save();

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Report product
// @route   POST /api/products/:id/report
// @access  Private
exports.reportProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const alreadyReported = product.reports.some(
      (report) => report.reporter.toString() === req.user.id && report.status === 'open'
    );

    if (alreadyReported) {
      return res.status(400).json({
        success: false,
        message: 'You already have an open report for this product'
      });
    }

    product.reports.push({
      reporter: req.user.id,
      reason: req.body.reason,
      details: req.body.details
    });
    product.reportCount = calculateReportCount(product.reports);

    addProductActivityLog(product, {
      action: 'product.reported',
      message: 'Product reported by user',
      metadata: { reason: req.body.reason },
      performedBy: req.user.id,
      performedByRole: req.user.role
    });

    await product.save();

    res.status(201).json({
      success: true,
      message: 'Product reported successfully',
      data: product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get reported products
// @route   GET /api/products/admin/reported
// @access  Private (Admin)
exports.getReportedProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const reportStatus = req.query.reportStatus || 'open';
    const query = reportStatus === 'all'
      ? { reportCount: { $gt: 0 } }
      : { reports: { $elemMatch: { status: reportStatus } } };

    const products = await Product.find(query)
      .populate('vendor', 'storeName')
      .populate('reports.reporter', 'name email')
      .sort('-reportCount -createdAt')
      .skip(skip)
      .limit(limit);

    const total = await Product.countDocuments(query);

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

// @desc    Moderate product
// @route   PUT /api/products/:id/moderate
// @access  Private (Admin)
exports.moderateProduct = async (req, res, next) => {
  try {
    const { action, reason } = req.body;
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.moderatedBy = req.user.id;
    product.moderatedAt = new Date();
    product.moderationReason = reason || '';

    if (action === 'approve') {
      product.isApproved = true;
      product.moderationStatus = 'approved';
      if (product.status === 'draft' || product.status === 'inactive') {
        product.status = product.stock > 0 ? 'active' : 'out-of-stock';
      }
      product.moderationHistory.push({
        action: 'approved',
        reason: reason || 'Approved by admin',
        performedBy: req.user.id,
        performedByRole: req.user.role
      });
    } else if (action === 'reject') {
      product.isApproved = false;
      product.moderationStatus = 'rejected';
      product.status = 'inactive';
      product.moderationHistory.push({
        action: 'rejected',
        reason: reason || 'Rejected by admin',
        performedBy: req.user.id,
        performedByRole: req.user.role
      });
    } else if (action === 'resolve-reports' || action === 'dismiss-reports') {
      product.reports = product.reports.map((report) => {
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
      product.reportCount = calculateReportCount(product.reports);
    }

    addProductActivityLog(product, {
      action: 'product.moderated',
      message: `Admin moderation action: ${action}`,
      metadata: { action, reason: reason || null },
      performedBy: req.user.id,
      performedByRole: req.user.role
    });

    await product.save();

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get product audit trail
// @route   GET /api/products/:id/audit
// @access  Private (Admin)
exports.getProductAuditTrail = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('activityLogs.performedBy', 'name email')
      .populate('moderationHistory.performedBy', 'name email')
      .populate('reports.reporter', 'name email')
      .populate('reports.handledBy', 'name email');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const reportsPage = parseInt(req.query.reportsPage, 10) || 1;
    const reportsLimit = parseInt(req.query.reportsLimit, 10) || 10;
    const activityPage = parseInt(req.query.activityPage, 10) || 1;
    const activityLimit = parseInt(req.query.activityLimit, 10) || 10;
    const historyPage = parseInt(req.query.historyPage, 10) || 1;
    const historyLimit = parseInt(req.query.historyLimit, 10) || 10;

    const reports = Array.isArray(product.reports) ? product.reports : [];
    const activityLogs = Array.isArray(product.activityLogs) ? product.activityLogs : [];
    const moderationHistory = Array.isArray(product.moderationHistory) ? product.moderationHistory : [];

    const paginatedReports = reports.slice((reportsPage - 1) * reportsLimit, reportsPage * reportsLimit);
    const paginatedActivityLogs = activityLogs.slice((activityPage - 1) * activityLimit, activityPage * activityLimit);
    const paginatedModerationHistory = moderationHistory.slice((historyPage - 1) * historyLimit, historyPage * historyLimit);

    res.status(200).json({
      success: true,
      data: {
        moderationStatus: product.moderationStatus,
        moderationReason: product.moderationReason,
        moderatedAt: product.moderatedAt,
        moderationHistory: paginatedModerationHistory,
        reportCount: product.reportCount || 0,
        reports: paginatedReports,
        activityLogs: paginatedActivityLogs,
        pagination: {
          reports: {
            page: reportsPage,
            limit: reportsLimit,
            total: reports.length,
            pages: Math.ceil(reports.length / reportsLimit)
          },
          activityLogs: {
            page: activityPage,
            limit: activityLimit,
            total: activityLogs.length,
            pages: Math.ceil(activityLogs.length / activityLimit)
          },
          moderationHistory: {
            page: historyPage,
            limit: historyLimit,
            total: moderationHistory.length,
            pages: Math.ceil(moderationHistory.length / historyLimit)
          }
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get vendor products
// @route   GET /api/products/vendor/:vendorId
// @access  Public
exports.getVendorProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;
    const skip = (page - 1) * limit;

    const query = {
      vendor: req.params.vendorId,
      status: { $in: PUBLIC_VISIBLE_STATUSES },
      isActive: true,
      isApproved: true,
      moderationStatus: 'approved'
    };

    const products = await Product.find(query)
      .populate('category', 'name slug')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);

    const total = await Product.countDocuments(query);

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

// @desc    Get featured products
// @route   GET /api/products/featured
// @access  Public
exports.getFeaturedProducts = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 8;

    const products = await Product.find({
      featured: true,
      status: 'active',
      isActive: true,
      isApproved: true,
      moderationStatus: 'approved'
    })
      .populate('vendor', 'storeName slug logo')
      .populate('category', 'name slug')
      .sort('-rating -totalSales')
      .limit(limit);

    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    next(error);
  }
};
