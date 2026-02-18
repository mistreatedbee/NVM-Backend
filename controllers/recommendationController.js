const RecentlyViewed = require('../models/RecentlyViewed');
const Product = require('../models/Product');

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(60, Math.max(1, parseInt(query.limit, 10) || 12));
  return { page, limit, skip: (page - 1) * limit };
}

// GET /api/recommendations
exports.getRecommendations = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const viewed = await RecentlyViewed.findOne({ userId: req.user.id }).select('items').lean();
    const viewedIds = (viewed?.items || []).map((item) => item.productId);

    let interestProducts = [];
    if (viewedIds.length) {
      interestProducts = await Product.find({ _id: { $in: viewedIds }, status: 'PUBLISHED', isActive: true })
        .select('category brand')
        .lean();
    }

    const categoryIds = [...new Set(interestProducts.map((p) => String(p.category)).filter(Boolean))];
    const brands = [...new Set(interestProducts.map((p) => p.brand).filter(Boolean))];

    const query = { status: 'PUBLISHED', isActive: true };
    if (viewedIds.length) query._id = { $nin: viewedIds };
    if (categoryIds.length || brands.length) {
      query.$or = [];
      if (categoryIds.length) query.$or.push({ category: { $in: categoryIds } });
      if (brands.length) query.$or.push({ brand: { $in: brands } });
    }

    let [data, total] = await Promise.all([
      Product.find(query)
        .select('-costPrice -reports -activityLogs')
        .populate('vendor', 'storeName slug logo')
        .populate('category', 'name slug')
        .sort({ ratingAvg: -1, totalSales: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Product.countDocuments(query)
    ]);

    if (!data.length) {
      [data, total] = await Promise.all([
        Product.find({ status: 'PUBLISHED', isActive: true })
          .select('-costPrice -reports -activityLogs')
          .populate('vendor', 'storeName slug logo')
          .populate('category', 'name slug')
          .sort({ totalSales: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Product.countDocuments({ status: 'PUBLISHED', isActive: true })
      ]);
    }

    return res.status(200).json({
      success: true,
      data,
      total,
      page,
      pages: Math.ceil(total / limit),
      limit
    });
  } catch (error) {
    return next(error);
  }
};
