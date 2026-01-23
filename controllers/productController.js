const Product = require('../models/Product');
const Vendor = require('../models/Vendor');

const PUBLIC_VISIBLE_STATUSES = ['active', 'out-of-stock'];

// @desc    Create product
// @route   POST /api/products
// @access  Private (Vendor)
exports.createProduct = async (req, res, next) => {
  try {
    // Get vendor
    const vendor = await Vendor.findOne({ user: req.user.id });
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }

    if (vendor.status !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Vendor must be approved to create products'
      });
    }

    // Temporary limit: vendors may only create 2 active products
    const activeProductCount = await Product.countDocuments({ vendor: vendor._id, isActive: true });
    if (activeProductCount >= 2) {
      return res.status(403).json({
        success: false,
        message: 'Product limit reached: you can only add 2 products at the moment'
      });
    }

    // Create product
    const product = await Product.create({
      ...req.body,
      vendor: vendor._id,
      // Ensure the product is visible immediately after creation
      status: req.body.status || 'active'
    });

    // Update vendor product count
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

    // Public list should only include visible products
    const query = { status: { $in: PUBLIC_VISIBLE_STATUSES }, isActive: true };

    // Category filter
    if (req.query.category) {
      query.category = req.query.category;
    }

    // Vendor filter
    if (req.query.vendor) {
      query.vendor = req.query.vendor;
    }

    // Product type filter
    if (req.query.type) {
      query.productType = req.query.type;
    }

    // Price range filter
    if (req.query.minPrice || req.query.maxPrice) {
      query.price = {};
      if (req.query.minPrice) {
        query.price.$gte = parseFloat(req.query.minPrice);
      }
      if (req.query.maxPrice) {
        query.price.$lte = parseFloat(req.query.maxPrice);
      }
    }

    // Search
    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }

    // Sort
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

    const products = await Product.find(query)
      .populate('vendor', 'storeName slug logo rating')
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

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
exports.getProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('vendor', 'storeName slug logo rating totalReviews')
      .populate('category', 'name slug');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Increment views
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

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Increment views
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
    let product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check ownership
    const vendor = await Vendor.findById(product.vendor);
    if (vendor.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this product'
      });
    }

    product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete product
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

    // Check ownership
    const vendor = await Vendor.findById(product.vendor);
    if (vendor.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this product'
      });
    }

    await product.deleteOne();

    // Update vendor product count
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
      isActive: true
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
      isActive: true
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
