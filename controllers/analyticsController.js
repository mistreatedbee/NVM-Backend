const Order = require('../models/Order');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Review = require('../models/Review');

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

    // Optional date range filtering (used by frontend)
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    const orderMatch = { 'items.vendor': vendor._id };
    if (startDate || endDate) {
      orderMatch.createdAt = {};
      if (startDate && !Number.isNaN(startDate.getTime())) orderMatch.createdAt.$gte = startDate;
      if (endDate && !Number.isNaN(endDate.getTime())) orderMatch.createdAt.$lte = endDate;
      if (Object.keys(orderMatch.createdAt).length === 0) delete orderMatch.createdAt;
    }

    // Orders / revenue over time: compute vendor revenue from item subtotals (not full order total which may include other vendors)
    const revenueByDay = await Order.aggregate([
      { $match: orderMatch },
      { $unwind: '$items' },
      { $match: { 'items.vendor': vendor._id } },
      {
        $project: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orderId: '$_id',
          revenue: '$items.subtotal',
          quantity: '$items.quantity'
        }
      },
      {
        $group: {
          _id: { date: '$date', orderId: '$orderId' },
          revenue: { $sum: '$revenue' },
          itemsSold: { $sum: '$quantity' }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          revenue: { $sum: '$revenue' },
          orders: { $sum: 1 },
          itemsSold: { $sum: '$itemsSold' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const totalRevenue = revenueByDay.reduce((sum, d) => sum + (d.revenue || 0), 0);
    const totalOrders = revenueByDay.reduce((sum, d) => sum + (d.orders || 0), 0);
    const totalItemsSold = revenueByDay.reduce((sum, d) => sum + (d.itemsSold || 0), 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Orders by status (count orders that include this vendor)
    const ordersByStatus = await Order.aggregate([
      { $match: orderMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Products summary
    const productQuery = { vendor: vendor._id, isActive: true };
    const [productsTotal, productsPublished, productsPending, productsRejected, productsDraft] = await Promise.all([
      Product.countDocuments(productQuery),
      Product.countDocuments({ ...productQuery, status: 'PUBLISHED' }),
      Product.countDocuments({ ...productQuery, status: 'PENDING' }),
      Product.countDocuments({ ...productQuery, status: 'REJECTED' }),
      Product.countDocuments({ ...productQuery, status: 'DRAFT' })
    ]);

    // Top products
    const topProducts = await Product.find({ ...productQuery, status: 'PUBLISHED' })
      .select('name images price totalSales')
      .sort('-totalSales -createdAt')
      .limit(5);

    // Reviews summary (vendor-level)
    const reviewMatch = { targetType: 'VENDOR', vendorId: vendor._id, status: 'APPROVED' };
    const reviewAgg = await Review.aggregate([
      { $match: reviewMatch },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          averageRating: { $avg: '$rating' },
          r1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
          r2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          r3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          r4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          r5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } }
        }
      }
    ]);

    const reviewSummary = reviewAgg?.[0] || { total: 0, averageRating: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalRevenue,
          totalOrders,
          totalItemsSold,
          averageOrderValue
        },
        products: {
          total: productsTotal,
          published: productsPublished,
          pending: productsPending,
          rejected: productsRejected,
          draft: productsDraft
        },
        reviews: {
          total: reviewSummary.total,
          averageRating: Number((reviewSummary.averageRating || 0).toFixed(1)),
          distribution: {
            1: reviewSummary.r1,
            2: reviewSummary.r2,
            3: reviewSummary.r3,
            4: reviewSummary.r4,
            5: reviewSummary.r5
          }
        },
        revenueByDay: revenueByDay.map(d => ({ _id: d._id, revenue: d.revenue || 0, orders: d.orders || 0 })),
        topProducts,
        ordersByStatus
      }
    });
  } catch (error) {
    next(error);
  }
};

