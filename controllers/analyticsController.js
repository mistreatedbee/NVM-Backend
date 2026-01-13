const Order = require('../models/Order');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const User = require('../models/User');

// @desc    Get admin analytics
// @route   GET /api/analytics/admin
// @access  Private/Admin
exports.getAdminAnalytics = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalVendors = await Vendor.countDocuments();
    const totalProducts = await Product.countDocuments();
    const totalOrders = await Order.countDocuments();
    
    const orders = await Order.find();
    const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalVendors,
        totalProducts,
        totalOrders,
        totalRevenue
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get vendor analytics
// @route   GET /api/analytics/vendor
// @access  Private/Vendor
exports.getVendorAnalytics = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user.id });
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const totalProducts = await Product.countDocuments({ vendor: vendor._id });
    const orders = await Order.find({ 'items.vendor': vendor._id });
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);

    res.status(200).json({
      success: true,
      data: {
        totalProducts,
        totalOrders,
        totalRevenue,
        rating: vendor.rating,
        totalReviews: vendor.totalReviews
      }
    });
  } catch (error) {
    next(error);
  }
};

