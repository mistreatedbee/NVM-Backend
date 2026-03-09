const Product = require('../models/Product');

function parsePagination(query, defaults = { page: 1, limit: 12 }) {
  const page = Math.max(1, parseInt(query.page, 10) || defaults.page);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaults.limit));
  return { page, limit, skip: (page - 1) * limit };
}

// GET /api/products/new
exports.getNewArrivals = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 8 });
    const query = { status: 'PUBLISHED', isActive: true };
    const [data, total] = await Promise.all([
      Product.find(query)
        .select('-costPrice -reports -activityLogs')
        .populate('vendor', 'storeName slug logo')
        .populate('category', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Product.countDocuments(query)
    ]);
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

// GET /api/products/:productId/similar
exports.getSimilarProducts = async (req, res, next) => {
  try {
    const limit = Math.min(24, Math.max(1, parseInt(req.query.limit, 10) || 8));
    const product = await Product.findOne({
      _id: req.params.productId,
      status: 'PUBLISHED',
      isActive: true
    }).select('_id category price brand tags');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const min = Math.max(0, Number(product.price) * 0.7);
    const max = Number(product.price) * 1.3;

    const query = {
      _id: { $ne: product._id },
      status: 'PUBLISHED',
      isActive: true,
      category: product.category,
      price: { $gte: min, $lte: max }
    };

    const orClauses = [];
    if (product.brand) {
      orClauses.push({ brand: { $regex: `^${String(product.brand).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    }
    if (Array.isArray(product.tags) && product.tags.length) {
      orClauses.push({ tags: { $in: product.tags.slice(0, 10) } });
    }
    if (orClauses.length) query.$or = orClauses;

    let data = await Product.find(query)
      .select('-costPrice -reports -activityLogs')
      .populate('vendor', 'storeName slug logo')
      .populate('category', 'name slug')
      .sort({ ratingAvg: -1, totalSales: -1, createdAt: -1 })
      .limit(limit);

    if (data.length < limit) {
      const fallback = await Product.find({
        _id: { $ne: product._id, $nin: data.map((d) => d._id) },
        status: 'PUBLISHED',
        isActive: true,
        category: product.category
      })
        .select('-costPrice -reports -activityLogs')
        .populate('vendor', 'storeName slug logo')
        .populate('category', 'name slug')
        .sort({ ratingAvg: -1, totalSales: -1, createdAt: -1 })
        .limit(limit - data.length);
      data = [...data, ...fallback];
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};
