const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Review = require('../models/Review');
const ProductAnalyticsEvent = require('../models/ProductAnalyticsEvent');
const PlaybookModule = require('../models/PlaybookModule');
const PlaybookLesson = require('../models/PlaybookLesson');
const VendorPlaybookProgress = require('../models/VendorPlaybookProgress');
const { trackProductEvent, getIpHash, mapSource } = require('../services/productAnalyticsService');

const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

function makeCacheKey(prefix, params) {
  return `${prefix}:${JSON.stringify(params)}`;
}

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCache(key, value) {
  cache.set(key, { value, createdAt: Date.now() });
}

function parseDateRange(query) {
  const now = new Date();
  const range = String(query.range || '30d');
  let from = null;
  let to = now;

  if (range === '7d') from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  else if (range === '30d') from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  else if (range === '90d') from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  else if (range === 'custom') {
    from = query.from ? new Date(query.from) : null;
    to = query.to ? new Date(query.to) : now;
  } else {
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const hasFrom = from instanceof Date && !Number.isNaN(from.getTime());
  const hasTo = to instanceof Date && !Number.isNaN(to.getTime());
  return {
    from: hasFrom ? from : null,
    to: hasTo ? to : now,
    range
  };
}

async function resolveVendorIdForUser(userId) {
  const vendor = await Vendor.findOne({ user: userId }).select('_id');
  return vendor?._id || null;
}

function buildOrderDateMatch(dateRange) {
  const match = {};
  if (dateRange.from || dateRange.to) {
    match.createdAt = {};
    if (dateRange.from) match.createdAt.$gte = dateRange.from;
    if (dateRange.to) match.createdAt.$lte = dateRange.to;
  }
  return match;
}

function buildRevenueEligibilityExpr() {
  return {
    $or: [
      { $in: [{ $toUpper: { $ifNull: ['$paymentStatus', ''] } }, ['PAID', 'COMPLETED']] },
      { $in: [{ $toUpper: { $ifNull: ['$status', ''] } }, ['CONFIRMED', 'DELIVERED']] },
      { $in: [{ $toUpper: { $ifNull: ['$orderStatus', ''] } }, ['DELIVERED', 'PARTIALLY_DELIVERED', 'CONFIRMED']] }
    ]
  };
}

exports.getVendorInsightsSummary = async (req, res, next) => {
  try {
    const vendorId = await resolveVendorIdForUser(req.user.id);
    if (!vendorId) return res.status(404).json({ success: false, message: 'Vendor profile not found' });

    const dateRange = parseDateRange(req.query);
    const cacheKey = makeCacheKey('insights-summary', { vendorId: String(vendorId), ...dateRange });
    const cached = getCache(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached, cached: true });

    const orderMatch = {
      'items.vendor': vendorId,
      ...buildOrderDateMatch(dateRange)
    };

    const eligibilityExpr = buildRevenueEligibilityExpr();

    const [summaryAgg, topProductsAgg, revenueByDayAgg, ordersByStatusAgg, repeatCustomersAgg, refundCount] = await Promise.all([
      Order.aggregate([
        { $match: orderMatch },
        { $unwind: '$items' },
        {
          $match: {
            $and: [{ 'items.vendor': vendorId }, { $expr: eligibilityExpr }]
          }
        },
        {
          $group: {
            _id: '$_id',
            orderRevenue: { $sum: { $ifNull: ['$items.subtotal', { $multiply: ['$items.price', '$items.quantity'] }] } },
            orderUnits: { $sum: { $ifNull: ['$items.quantity', '$items.qty'] } }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$orderRevenue' },
            totalOrders: { $sum: 1 },
            totalUnitsSold: { $sum: '$orderUnits' }
          }
        }
      ]),
      Order.aggregate([
        { $match: orderMatch },
        { $unwind: '$items' },
        {
          $match: {
            $and: [{ 'items.vendor': vendorId }, { $expr: eligibilityExpr }]
          }
        },
        {
          $group: {
            _id: '$items.product',
            unitsSold: { $sum: { $ifNull: ['$items.quantity', '$items.qty'] } },
            revenue: { $sum: { $ifNull: ['$items.subtotal', { $multiply: ['$items.price', '$items.quantity'] }] } }
          }
        },
        { $sort: { revenue: -1, unitsSold: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            productId: '$_id',
            name: '$product.name',
            slug: '$product.slug',
            unitsSold: 1,
            revenue: 1
          }
        }
      ]),
      Order.aggregate([
        { $match: orderMatch },
        { $unwind: '$items' },
        {
          $match: {
            $and: [{ 'items.vendor': vendorId }, { $expr: eligibilityExpr }]
          }
        },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              orderId: '$_id'
            },
            dailyRevenue: { $sum: { $ifNull: ['$items.subtotal', { $multiply: ['$items.price', '$items.quantity'] }] } }
          }
        },
        {
          $group: {
            _id: '$_id.day',
            revenue: { $sum: '$dailyRevenue' },
            orders: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Order.aggregate([
        { $match: { 'items.vendor': vendorId, ...buildOrderDateMatch(dateRange) } },
        {
          $group: {
            _id: { $toUpper: { $ifNull: ['$status', 'UNKNOWN'] } },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),
      Order.aggregate([
        { $match: orderMatch },
        { $unwind: '$items' },
        {
          $match: {
            $and: [{ 'items.vendor': vendorId }, { $expr: eligibilityExpr }]
          }
        },
        {
          $group: {
            _id: { orderId: '$_id', customerId: '$customer' }
          }
        },
        {
          $group: {
            _id: '$_id.customerId',
            orderCount: { $sum: 1 }
          }
        },
        { $match: { orderCount: { $gte: 2 } } },
        { $count: 'repeatCustomersCount' }
      ]),
      Order.countDocuments({
        'items.vendor': vendorId,
        ...buildOrderDateMatch(dateRange),
        $or: [{ paymentStatus: { $in: ['refunded', 'REFUNDED'] } }, { status: { $in: ['refunded', 'REFUNDED'] } }]
      })
    ]);

    const overview = summaryAgg[0] || { totalRevenue: 0, totalOrders: 0, totalUnitsSold: 0 };
    const avgOrderValue = overview.totalOrders > 0 ? overview.totalRevenue / overview.totalOrders : 0;
    const data = {
      totalRevenue: Number((overview.totalRevenue || 0).toFixed(2)),
      totalOrders: overview.totalOrders || 0,
      totalUnitsSold: overview.totalUnitsSold || 0,
      avgOrderValue: Number(avgOrderValue.toFixed(2)),
      repeatCustomersCount: repeatCustomersAgg[0]?.repeatCustomersCount || 0,
      topProducts: topProductsAgg,
      revenueByDay: revenueByDayAgg.map((d) => ({ date: d._id, revenue: Number((d.revenue || 0).toFixed(2)), orders: d.orders || 0 })),
      ordersByStatus: ordersByStatusAgg.map((d) => ({ status: d._id, count: d.count })),
      refundCount
    };

    setCache(cacheKey, data);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorProductInsights = async (req, res, next) => {
  try {
    const vendorId = await resolveVendorIdForUser(req.user.id);
    if (!vendorId) return res.status(404).json({ success: false, message: 'Vendor profile not found' });

    const dateRange = parseDateRange(req.query);
    const sort = String(req.query.sort || 'bestSelling');
    const cacheKey = makeCacheKey('insights-products', { vendorId: String(vendorId), ...dateRange, sort });
    const cached = getCache(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached, cached: true });

    const eventMatch = {
      vendorId,
      ...(dateRange.from || dateRange.to
        ? {
            createdAt: {
              ...(dateRange.from ? { $gte: dateRange.from } : {}),
              ...(dateRange.to ? { $lte: dateRange.to } : {})
            }
          }
        : {})
    };

    const eligibilityExpr = buildRevenueEligibilityExpr();

    const [eventsAgg, salesAgg, products, reviewsAgg] = await Promise.all([
      ProductAnalyticsEvent.aggregate([
        { $match: eventMatch },
        {
          $group: {
            _id: '$productId',
            viewsCount: { $sum: { $cond: [{ $eq: ['$eventType', 'VIEW'] }, 1, 0] } },
            clicksCount: { $sum: { $cond: [{ $eq: ['$eventType', 'CLICK'] }, 1, 0] } },
            addToCartCount: { $sum: { $cond: [{ $eq: ['$eventType', 'ADD_TO_CART'] }, 1, 0] } },
            purchasesCount: { $sum: { $cond: [{ $eq: ['$eventType', 'PURCHASE'] }, 1, 0] } }
          }
        }
      ]),
      Order.aggregate([
        { $match: { 'items.vendor': vendorId, ...buildOrderDateMatch(dateRange) } },
        { $unwind: '$items' },
        { $match: { $and: [{ 'items.vendor': vendorId }, { $expr: eligibilityExpr }] } },
        {
          $group: {
            _id: '$items.product',
            revenue: { $sum: { $ifNull: ['$items.subtotal', { $multiply: ['$items.price', '$items.quantity'] }] } },
            unitsSold: { $sum: { $ifNull: ['$items.quantity', '$items.qty'] } }
          }
        }
      ]),
      Product.find({ vendor: vendorId }).select('_id name slug stock trackInventory rating ratingAvg totalReviews ratingCount'),
      Review.aggregate([
        { $match: { targetType: 'PRODUCT', status: 'APPROVED' } },
        {
          $group: {
            _id: '$productId',
            ratingAvg: { $avg: '$rating' },
            ratingCount: { $sum: 1 }
          }
        }
      ])
    ]);

    const eventMap = new Map(eventsAgg.map((row) => [String(row._id), row]));
    const salesMap = new Map(salesAgg.map((row) => [String(row._id), row]));
    const reviewMap = new Map(reviewsAgg.map((row) => [String(row._id), row]));

    const rows = products.map((product) => {
      const id = String(product._id);
      const e = eventMap.get(id) || {};
      const s = salesMap.get(id) || {};
      const r = reviewMap.get(id) || {};
      const viewsCount = e.viewsCount || 0;
      const purchasesCount = e.purchasesCount || 0;
      return {
        productId: id,
        name: product.name,
        slug: product.slug,
        viewsCount,
        clicksCount: e.clicksCount || 0,
        addToCartCount: e.addToCartCount || 0,
        purchasesCount,
        conversionRate: viewsCount > 0 ? Number(((purchasesCount / viewsCount) * 100).toFixed(2)) : 0,
        revenue: Number(((s.revenue || 0)).toFixed(2)),
        unitsSold: s.unitsSold || 0,
        stockRemaining: product.trackInventory ? product.stock : null,
        ratingAvg: Number(((r.ratingAvg ?? product.ratingAvg ?? product.rating ?? 0)).toFixed(2)),
        ratingCount: r.ratingCount ?? product.ratingCount ?? product.totalReviews ?? 0
      };
    });

    const sorters = {
      mostViewed: (a, b) => b.viewsCount - a.viewsCount,
      bestSelling: (a, b) => b.unitsSold - a.unitsSold,
      highestRevenue: (a, b) => b.revenue - a.revenue,
      bestConversion: (a, b) => b.conversionRate - a.conversionRate,
      lowestConversion: (a, b) => a.conversionRate - b.conversionRate
    };
    rows.sort(sorters[sort] || sorters.bestSelling);

    setCache(cacheKey, rows);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorProductInsightDetail = async (req, res, next) => {
  try {
    const vendorId = await resolveVendorIdForUser(req.user.id);
    if (!vendorId) return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    const productId = req.params.productId;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product id' });
    }
    const dateRange = parseDateRange(req.query);

    const match = {
      vendorId,
      productId: new mongoose.Types.ObjectId(productId),
      ...(dateRange.from || dateRange.to
        ? {
            createdAt: {
              ...(dateRange.from ? { $gte: dateRange.from } : {}),
              ...(dateRange.to ? { $lte: dateRange.to } : {})
            }
          }
        : {})
    };

    const [trend, bySource] = await Promise.all([
      ProductAnalyticsEvent.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              eventType: '$eventType'
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.day': 1 } }
      ]),
      ProductAnalyticsEvent.aggregate([
        { $match: match },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    return res.status(200).json({
      success: true,
      data: {
        trend: trend.map((row) => ({ date: row._id.day, eventType: row._id.eventType, count: row.count })),
        trafficSources: bySource.map((row) => ({ source: row._id, count: row.count }))
      }
    });
  } catch (error) {
    return next(error);
  }
};

async function trackProductEventFromRequest(req, res, eventType) {
  const { productId, source, sessionId } = req.body || {};
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({ success: false, message: 'Invalid productId' });
  }

  const product = await Product.findById(productId).select('_id vendor status isActive');
  if (!product || product.status !== 'PUBLISHED' || !product.isActive) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  await trackProductEvent({
    product,
    eventType,
    userId: req.user?._id,
    sessionId,
    ipHash: getIpHash(req),
    source: mapSource(source)
  });

  return res.status(201).json({ success: true });
}

exports.trackProductView = async (req, res, next) => {
  try {
    return await trackProductEventFromRequest(req, res, 'VIEW');
  } catch (error) {
    return next(error);
  }
};

exports.trackProductClick = async (req, res, next) => {
  try {
    return await trackProductEventFromRequest(req, res, 'CLICK');
  } catch (error) {
    return next(error);
  }
};

exports.trackProductAddToCart = async (req, res, next) => {
  try {
    return await trackProductEventFromRequest(req, res, 'ADD_TO_CART');
  } catch (error) {
    return next(error);
  }
};

exports.getVendorPlaybookModules = async (req, res, next) => {
  try {
    const vendorId = await resolveVendorIdForUser(req.user.id);
    if (!vendorId) return res.status(404).json({ success: false, message: 'Vendor profile not found' });

    const [modules, lessons, progress] = await Promise.all([
      PlaybookModule.find({ status: 'PUBLISHED' }).sort({ order: 1, createdAt: 1 }),
      PlaybookLesson.find({ status: 'PUBLISHED' }).select('_id moduleId'),
      VendorPlaybookProgress.find({ vendorId }).select('lessonId completed')
    ]);

    const lessonCountByModule = lessons.reduce((acc, lesson) => {
      const key = String(lesson.moduleId);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const completedSet = new Set(progress.filter((p) => p.completed).map((p) => String(p.lessonId)));
    const completedCountByModule = lessons.reduce((acc, lesson) => {
      const key = String(lesson.moduleId);
      if (completedSet.has(String(lesson._id))) acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const data = modules.map((module) => {
      const totalLessons = lessonCountByModule[String(module._id)] || 0;
      const completedLessons = completedCountByModule[String(module._id)] || 0;
      return {
        ...module.toObject(),
        totalLessons,
        completedLessons,
        completionPercent: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
      };
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorPlaybookModuleBySlug = async (req, res, next) => {
  try {
    const vendorId = await resolveVendorIdForUser(req.user.id);
    if (!vendorId) return res.status(404).json({ success: false, message: 'Vendor profile not found' });

    const module = await PlaybookModule.findOne({ slug: req.params.slug, status: 'PUBLISHED' });
    if (!module) return res.status(404).json({ success: false, message: 'Module not found' });

    const lessons = await PlaybookLesson.find({ moduleId: module._id, status: 'PUBLISHED' }).sort({ order: 1, createdAt: 1 });
    const progress = await VendorPlaybookProgress.find({ vendorId, lessonId: { $in: lessons.map((l) => l._id) } });
    const progressMap = new Map(progress.map((p) => [String(p.lessonId), p]));

    const lessonRows = lessons.map((lesson) => ({
      ...lesson.toObject(),
      progress: progressMap.get(String(lesson._id)) || {
        completed: false,
        checklistState: {},
        lastViewedAt: null
      }
    }));

    return res.status(200).json({ success: true, data: { module, lessons: lessonRows } });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorPlaybookLessonBySlug = async (req, res, next) => {
  try {
    const vendorId = await resolveVendorIdForUser(req.user.id);
    if (!vendorId) return res.status(404).json({ success: false, message: 'Vendor profile not found' });

    const lesson = await PlaybookLesson.findOne({ slug: req.params.slug, status: 'PUBLISHED' }).populate('moduleId', 'title slug status');
    if (!lesson || !lesson.moduleId || lesson.moduleId.status !== 'PUBLISHED') {
      return res.status(404).json({ success: false, message: 'Lesson not found' });
    }

    const progress = await VendorPlaybookProgress.findOne({ vendorId, lessonId: lesson._id });
    if (!progress) {
      await VendorPlaybookProgress.create({
        vendorId,
        lessonId: lesson._id,
        completed: false,
        checklistState: {},
        lastViewedAt: new Date()
      });
    } else {
      progress.lastViewedAt = new Date();
      await progress.save();
    }

    return res.status(200).json({
      success: true,
      data: {
        lesson,
        progress: progress || {
          completed: false,
          checklistState: {},
          lastViewedAt: new Date()
        }
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateVendorPlaybookProgress = async (req, res, next) => {
  try {
    const vendorId = await resolveVendorIdForUser(req.user.id);
    if (!vendorId) return res.status(404).json({ success: false, message: 'Vendor profile not found' });

    const { lessonId, completed, checklistUpdates } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({ success: false, message: 'Invalid lessonId' });
    }

    const lesson = await PlaybookLesson.findOne({ _id: lessonId, status: 'PUBLISHED' });
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });

    const progress = await VendorPlaybookProgress.findOneAndUpdate(
      { vendorId, lessonId },
      {
        $setOnInsert: { vendorId, lessonId },
        $set: {
          ...(typeof completed === 'boolean' ? { completed, completedAt: completed ? new Date() : null } : {}),
          ...(checklistUpdates && typeof checklistUpdates === 'object'
            ? {
                checklistState: checklistUpdates
              }
            : {}),
          lastViewedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({ success: true, data: progress });
  } catch (error) {
    return next(error);
  }
};
