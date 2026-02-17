const SearchHistory = require('../models/SearchHistory');
const Recommendation = require('../models/Recommendation');
const Product = require('../models/Product');
const Order = require('../models/Order');

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

