const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Product = require('../models/Product');
const { sendEmail, vendorApprovalEmail } = require('../utils/email');

// @desc    Create vendor profile
// @route   POST /api/vendors
// @access  Private (Vendor)
exports.createVendor = async (req, res, next) => {
  try {
    // Check if vendor already exists for this user
    const existingVendor = await Vendor.findOne({ user: req.user.id });
    if (existingVendor) {
      return res.status(400).json({
        success: false,
        message: 'Vendor profile already exists'
      });
    }

    // Create vendor
    const vendor = await Vendor.create({
      ...req.body,
      user: req.user.id
    });

    // Update user role to vendor
    await User.findByIdAndUpdate(req.user.id, { role: 'vendor' });

    res.status(201).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get vendor profile
// @route   GET /api/vendors/:id
// @access  Public
exports.getVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id)
      .populate('user', 'name email avatar');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get vendor by slug
// @route   GET /api/vendors/slug/:slug
// @access  Public
exports.getVendorBySlug = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ slug: req.params.slug })
      .populate('user', 'name email avatar');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all vendors
// @route   GET /api/vendors
// @access  Public (approved only) / Admin (all statuses)
exports.getAllVendors = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;
    const skip = (page - 1) * limit;

    // Build query
    const query = {};
    
    // If status is specified in query, use it (for admin)
    if (req.query.status) {
      query.status = req.query.status;
    } else {
      // Default: show only approved vendors for public
      query.status = 'approved';
      query.isActive = true;
    }

    if (req.query.category) {
      query.category = req.query.category;
    }

    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }

    // Sort
    let sort = '-createdAt';
    if (req.query.sort === 'rating') {
      sort = '-rating';
    } else if (req.query.sort === 'sales') {
      sort = '-totalSales';
    }

    const vendors = await Vendor.find(query)
      .populate('user', 'name avatar')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Vendor.countDocuments(query);

    res.status(200).json({
      success: true,
      count: vendors.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: vendors
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update vendor profile
// @route   PUT /api/vendors/:id
// @access  Private (Vendor/Admin)
exports.updateVendor = async (req, res, next) => {
  try {
    let vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Check ownership
    if (vendor.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this vendor'
      });
    }

    vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get my vendor profile
// @route   GET /api/vendors/me/profile
// @access  Private (Vendor)
exports.getMyVendorProfile = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user.id })
      .populate('user', 'name email avatar');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get vendor analytics
// @route   GET /api/vendors/:id/analytics
// @access  Private (Vendor/Admin)
exports.getVendorAnalytics = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Check ownership
    if (vendor.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    // Get product count
    const productCount = await Product.countDocuments({ vendor: vendor._id });

    // Get active products
    const activeProducts = await Product.countDocuments({
      vendor: vendor._id,
      status: 'active'
    });

    const analytics = {
      totalProducts: productCount,
      activeProducts,
      totalSales: vendor.totalSales,
      totalRevenue: vendor.totalRevenue,
      rating: vendor.rating,
      totalReviews: vendor.totalReviews
    };

    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve vendor (Admin)
// @route   PUT /api/vendors/:id/approve
// @access  Private (Admin)
exports.approveVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id).populate('user');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    vendor.status = 'approved';
    vendor.approvedAt = Date.now();
    vendor.approvedBy = req.user.id;
    await vendor.save();

    // Send approval email
    try {
      await sendEmail({
        email: vendor.email,
        subject: 'Vendor Application Approved!',
        html: vendorApprovalEmail(vendor.user.name, vendor.storeName)
      });
    } catch (error) {
      console.error('Approval email failed:', error);
    }

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reject vendor (Admin)
// @route   PUT /api/vendors/:id/reject
// @access  Private (Admin)
exports.rejectVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    vendor.status = 'rejected';
    vendor.rejectionReason = req.body.reason;
    await vendor.save();

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
};
