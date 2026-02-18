const SearchHistory = require('../models/SearchHistory');
const Recommendation = require('../models/Recommendation');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Category = require('../models/Category');
const Vendor = require('../models/Vendor');

// @desc    Save search query
// @route   POST /api/search/history
// @access  Private
exports.saveSearch = async (req, res, next) => {
  try {
    const { query, filters, resultsCount } = req.body;
    
    await SearchHistory.create({
      user: req.user.id,
      query,
      filters,
      resultsCount
    });
    
    res.status(201).json({
      success: true,
      message: 'Search saved'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get search history
// @route   GET /api/search/history
// @access  Private
exports.getSearchHistory = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    
    const history = await SearchHistory.find({ user: req.user.id })
      .sort('-createdAt')
      .limit(limit)
      .select('query filters resultsCount createdAt');
    
    res.status(200).json({
      success: true,
      count: history.length,
      data: history
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get popular searches
// @route   GET /api/search/popular
// @access  Public
exports.getPopularSearches = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    
    const popular = await SearchHistory.aggregate([
      {
        $group: {
          _id: '$query',
          count: { $sum: 1 },
          avgResults: { $avg: '$resultsCount' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: limit },
      {
        $project: {
          query: '$_id',
          count: 1,
          avgResults: 1,
          _id: 0
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: popular
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Clear search history
// @route   DELETE /api/search/history
// @access  Private
exports.clearSearchHistory = async (req, res, next) => {
  try {
    await SearchHistory.deleteMany({ user: req.user.id });
    
    res.status(200).json({
      success: true,
      message: 'Search history cleared'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Generate recommendations
// @route   POST /api/search/recommendations/generate
// @access  Private
exports.generateRecommendations = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get user's search history
    const searches = await SearchHistory.find({ user: userId })
      .sort('-createdAt')
      .limit(50);
    
    // Get user's orders
    const orders = await Order.find({ customer: userId })
      .populate('items.product');
    
    // Extract categories and products
    const categoryInterests = {};
    const viewedProducts = new Set();
    const purchasedProducts = new Set();
    
    searches.forEach(search => {
      if (search.filters && search.filters.category) {
        categoryInterests[search.filters.category] = 
          (categoryInterests[search.filters.category] || 0) + 1;
      }
      search.clickedProducts.forEach(cp => {
        viewedProducts.add(cp.product.toString());
      });
    });
    
    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.product) {
          purchasedProducts.add(item.product._id.toString());
        }
      });
    });
    
    // Find similar products
    const recommendations = [];
    
    // Based on category interests
    for (const [category, count] of Object.entries(categoryInterests)) {
      const products = await Product.find({
        category,
        status: 'PUBLISHED',
        isActive: true
      })
        .sort('-rating -totalSales')
        .limit(5);
      
      products.forEach(product => {
        recommendations.push({
          user: userId,
          product: product._id,
          score: count * 10,
          reasons: ['category-interest']
        });
      });
    }
    
    // Trending products
    const trending = await Product.find({
      status: 'PUBLISHED',
      isActive: true,
      featured: true
    })
      .sort('-totalSales -views')
      .limit(10);
    
    trending.forEach(product => {
      recommendations.push({
        user: userId,
        product: product._id,
        score: 50,
        reasons: ['trending']
      });
    });
    
    // Remove duplicates and save
    const uniqueRecommendations = recommendations.reduce((acc, curr) => {
      const existing = acc.find(r => r.product.toString() === curr.product.toString());
      if (existing) {
        existing.score += curr.score;
        existing.reasons = [...new Set([...existing.reasons, ...curr.reasons])];
      } else {
        acc.push(curr);
      }
      return acc;
    }, []);
    
    // Clear old recommendations
    await Recommendation.deleteMany({ user: userId });
    
    // Save new recommendations
    if (uniqueRecommendations.length > 0) {
      await Recommendation.insertMany(uniqueRecommendations);
    }
    
    res.status(200).json({
      success: true,
      message: 'Recommendations generated',
      count: uniqueRecommendations.length
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get recommendations
// @route   GET /api/search/recommendations
// @access  Private
exports.getRecommendations = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    
    const recommendations = await Recommendation.find({
      user: req.user.id,
      shown: false
    })
      .populate('product')
      .sort('-score')
      .limit(limit);
    
    // Mark as shown
    const ids = recommendations.map(r => r._id);
    await Recommendation.updateMany(
      { _id: { $in: ids } },
      { shown: true }
    );
    
    res.status(200).json({
      success: true,
      count: recommendations.length,
      data: recommendations
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Track recommendation click
// @route   PUT /api/search/recommendations/:id/click
// @access  Private
exports.trackRecommendationClick = async (req, res, next) => {
  try {
    await Recommendation.findByIdAndUpdate(
      req.params.id,
      { clicked: true }
    );
    
    res.status(200).json({
      success: true,
      message: 'Click tracked'
    });
  } catch (error) {
    next(error);
  }
};

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 12));
  return { page, limit, skip: (page - 1) * limit };
}

function getSort(sort, hasQuery) {
  if (sort === 'price_asc') return { price: 1, createdAt: -1 };
  if (sort === 'price_desc') return { price: -1, createdAt: -1 };
  if (sort === 'newest') return { createdAt: -1 };
  if (sort === 'rating_desc') return { ratingAvg: -1, ratingCount: -1 };
  if (sort === 'trending') return { totalSales: -1, views: -1, createdAt: -1 };
  if (hasQuery) return { score: { $meta: 'textScore' }, createdAt: -1 };
  return { createdAt: -1 };
}

async function resolveCategory(category) {
  if (!category) return null;
  if (/^[a-f\d]{24}$/i.test(String(category))) return category;
  const bySlug = await Category.findOne({ slug: String(category).toLowerCase() }).select('_id').lean();
  if (bySlug?._id) return bySlug._id;
  const byName = await Category.findOne({ name: { $regex: `^${String(category)}$`, $options: 'i' } }).select('_id').lean();
  return byName?._id || null;
}

// @desc    Search products for discovery page
// @route   GET /api/search/products
// @access  Public
exports.searchProductsDiscovery = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = { status: 'PUBLISHED', isActive: true };
    const q = String(req.query.q || '').trim();

    if (q) query.$text = { $search: q.slice(0, 120) };

    if (req.query.category) {
      const categoryId = await resolveCategory(req.query.category);
      if (!categoryId) {
        return res.status(200).json({ success: true, data: [], total: 0, page, pages: 0, limit });
      }
      query.category = categoryId;
    }

    if (req.query.minPrice || req.query.maxPrice) {
      query.price = {};
      if (req.query.minPrice !== undefined) query.price.$gte = Number(req.query.minPrice);
      if (req.query.maxPrice !== undefined) query.price.$lte = Number(req.query.maxPrice);
    }

    if (req.query.brand) {
      query.brand = { $regex: String(req.query.brand).trim(), $options: 'i' };
    }

    if (req.query.location) {
      const locationTerm = String(req.query.location).trim();
      query.$or = [
        { 'location.city': { $regex: locationTerm, $options: 'i' } },
        { 'location.state': { $regex: locationTerm, $options: 'i' } },
        { 'location.country': { $regex: locationTerm, $options: 'i' } },
        { 'location.serviceArea': { $regex: locationTerm, $options: 'i' } }
      ];
    }

    if (req.query.minRating !== undefined && req.query.minRating !== '') {
      query.ratingAvg = { $gte: Number(req.query.minRating) };
    }

    const projection = q ? { score: { $meta: 'textScore' } } : {};
    const sort = getSort(req.query.sort, Boolean(q));

    const [products, total] = await Promise.all([
      Product.find(query, projection)
        .select('-costPrice -reports -activityLogs')
        .populate('vendor', 'storeName slug logo location')
        .populate('category', 'name slug')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Product.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: products,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Autocomplete suggestions
// @route   GET /api/search/autocomplete?q=
// @access  Public
exports.autocomplete = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.status(200).json({ success: true, data: [] });
    }

    const limit = Math.min(12, Math.max(8, parseInt(req.query.limit, 10) || 10));
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const [products, categories, vendors] = await Promise.all([
      Product.find({ status: 'PUBLISHED', isActive: true, $or: [{ name: regex }, { title: regex }] })
        .select('_id name title slug')
        .limit(limit)
        .lean(),
      Category.find({ isActive: true, name: regex }).select('_id name slug').limit(limit).lean(),
      Vendor.find({ status: 'approved', storeName: regex }).select('_id storeName slug').limit(limit).lean()
    ]);

    const suggestions = [];
    for (const p of products) {
      suggestions.push({ type: 'product', id: p._id, value: p.title || p.name, slug: p.slug });
    }
    for (const c of categories) {
      suggestions.push({ type: 'category', id: c._id, value: c.name, slug: c.slug });
    }
    for (const v of vendors) {
      suggestions.push({ type: 'vendor', id: v._id, value: v.storeName, slug: v.slug });
    }

    return res.status(200).json({ success: true, data: suggestions.slice(0, limit) });
  } catch (error) {
    return next(error);
  }
};

