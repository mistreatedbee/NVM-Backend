const mongoose = require('mongoose');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Product = require('../models/Product');
const Order = require('../models/Order');

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map();

function getCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.createdAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCache(key, value) {
  cache.set(key, { value, createdAt: Date.now() });
}

function toOrderStatusBucket(raw) {
  const value = String(raw || '').toUpperCase();
  if (value.includes('PENDING')) return 'pending';
  if (value.includes('PROCESS')) return 'processing';
  if (value.includes('SHIP')) return 'shipped';
  if (value.includes('DELIVER')) return 'delivered';
  if (value.includes('CANCEL')) return 'cancelled';
  return 'other';
}

function mapVendorStatus(status, legacyStatus) {
  const value = String(status || legacyStatus || '').toUpperCase();
  if (value === 'ACTIVE' || value === 'APPROVED') return 'ACTIVE';
  if (value === 'PENDING') return 'PENDING';
  if (value === 'SUSPENDED') return 'SUSPENDED';
  if (value === 'REJECTED') return 'REJECTED';
  return 'PENDING';
}

function mapProductStatus(status, isActive) {
  const value = String(status || '').toUpperCase();
  if (value === 'PUBLISHED') return 'PUBLISHED';
  if (value === 'PENDING') return 'PENDING';
  if (value === 'DRAFT') return 'DRAFT';
  if (value === 'REJECTED') return 'REJECTED';
  return isActive === false ? 'INACTIVE' : 'DRAFT';
}

function isPaidStatus(paymentStatus) {
  return String(paymentStatus || '').toUpperCase() === 'PAID';
}

function buildAdminOverview(vendorAgg, productAgg, orderAgg, gmvAgg, recentVendors, recentProducts, recentOrders) {
  const vendors = { total: 0, active: 0, pending: 0, suspended: 0, rejected: 0 };
  const products = { total: 0, published: 0, pending: 0, draft: 0, rejected: 0, inactive: 0 };
  const orders = {
    total: 0,
    byStatus: { pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 },
    paidCount: 0,
    unpaidCount: 0
  };

  for (const row of vendorAgg) {
    vendors.total += row.count || 0;
    const key = mapVendorStatus(row.vendorStatus, row.legacyStatus).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(vendors, key)) vendors[key] += row.count || 0;
  }

  for (const row of productAgg) {
    products.total += row.count || 0;
    const bucket = mapProductStatus(row.status, row.isActive).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(products, bucket)) products[bucket] += row.count || 0;
  }

  for (const row of orderAgg) {
    orders.total += row.count || 0;
    const statusBucket = toOrderStatusBucket(row.orderStatus || row.status);
    if (Object.prototype.hasOwnProperty.call(orders.byStatus, statusBucket)) {
      orders.byStatus[statusBucket] += row.count || 0;
    }
    if (isPaidStatus(row.paymentStatus)) orders.paidCount += row.count || 0;
    else orders.unpaidCount += row.count || 0;
  }

  const revenue = {
    gmvTotal: Number((gmvAgg[0]?.gmvTotal || 0).toFixed(2)),
    gmv7d: Number((gmvAgg[0]?.gmv7d || 0).toFixed(2))
  };

  return {
    stats: { vendors, products, orders, revenue },
    recent: {
      vendors: recentVendors,
      products: recentProducts,
      orders: recentOrders
    },
    generatedAt: new Date().toISOString()
  };
}

exports.getAdminDashboardOverview = async (req, res, next) => {
  try {
    const cacheKey = 'admin-overview';
    const cached = getCache(cacheKey);
    if (cached) {
      res.set('Cache-Control', 'private, max-age=15');
      return res.status(200).json({ success: true, data: cached, cached: true });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [vendorAgg, productAgg, orderAgg, gmvAgg, recentVendors, recentProducts, recentOrders] = await Promise.all([
      Vendor.aggregate([
        {
          $group: {
            _id: { vendorStatus: '$vendorStatus', legacyStatus: '$status' },
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            vendorStatus: '$_id.vendorStatus',
            legacyStatus: '$_id.legacyStatus',
            count: 1
          }
        }
      ]),
      Product.aggregate([
        {
          $group: {
            _id: { status: '$status', isActive: '$isActive' },
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            status: '$_id.status',
            isActive: '$_id.isActive',
            count: 1
          }
        }
      ]),
      Order.aggregate([
        {
          $group: {
            _id: {
              orderStatus: '$orderStatus',
              status: '$status',
              paymentStatus: '$paymentStatus'
            },
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            orderStatus: '$_id.orderStatus',
            status: '$_id.status',
            paymentStatus: '$_id.paymentStatus',
            count: 1
          }
        }
      ]),
      Order.aggregate([
        {
          $group: {
            _id: null,
            gmvTotal: {
              $sum: {
                $cond: [{ $eq: [{ $toUpper: { $ifNull: ['$paymentStatus', ''] } }, 'PAID'] }, { $ifNull: ['$total', 0] }, 0]
              }
            },
            gmv7d: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: [{ $toUpper: { $ifNull: ['$paymentStatus', ''] } }, 'PAID'] },
                      { $gte: ['$createdAt', sevenDaysAgo] }
                    ]
                  },
                  { $ifNull: ['$total', 0] },
                  0
                ]
              }
            }
          }
        }
      ]),
      Vendor.find({})
        .select('_id storeName vendorStatus status createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Product.find({})
        .select('_id name title status createdAt vendor')
        .populate({ path: 'vendor', select: 'storeName', options: { lean: true } })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Order.find({})
        .select('_id orderNumber orderStatus status total createdAt customer')
        .populate({ path: 'customer', select: 'name email', options: { lean: true } })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
    ]);

    const data = buildAdminOverview(
      vendorAgg,
      productAgg,
      orderAgg,
      gmvAgg,
      recentVendors.map((vendor) => ({
        id: vendor._id,
        storeName: vendor.storeName,
        status: mapVendorStatus(vendor.vendorStatus, vendor.status),
        createdAt: vendor.createdAt
      })),
      recentProducts.map((product) => ({
        id: product._id,
        title: product.title || product.name,
        status: product.status,
        createdAt: product.createdAt,
        vendor: product.vendor
          ? {
              id: product.vendor._id,
              storeName: product.vendor.storeName
            }
          : null
      })),
      recentOrders.map((order) => ({
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.orderStatus || order.status,
        total: order.total,
        createdAt: order.createdAt,
        customer: order.customer
          ? {
              id: order.customer._id,
              name: order.customer.name,
              email: order.customer.email
            }
          : null
      }))
    );

    setCache(cacheKey, data);
    res.set('Cache-Control', 'private, max-age=15');
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorDashboardOverview = async (req, res, next) => {
  try {
    if (req.user.role !== 'vendor') {
      return res.status(403).json({ success: false, message: 'Access denied. Vendor privileges required.' });
    }

    const vendor = await Vendor.findOne({ user: req.user.id }).select('_id storeName');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    }

    const vendorObjectId = new mongoose.Types.ObjectId(vendor._id);
    const cacheKey = `vendor-overview:${String(vendor._id)}`;
    const cached = getCache(cacheKey);
    if (cached) {
      res.set('Cache-Control', 'private, max-age=15');
      return res.status(200).json({ success: true, data: cached, cached: true });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [productAgg, vendorOrderAgg, revenueAgg, recentProducts, recentOrders] = await Promise.all([
      Product.aggregate([
        { $match: { vendor: vendorObjectId } },
        {
          $group: {
            _id: { status: '$status', isActive: '$isActive' },
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            status: '$_id.status',
            isActive: '$_id.isActive',
            count: 1
          }
        }
      ]),
      Order.aggregate([
        { $match: { 'items.vendor': vendorObjectId } },
        { $unwind: '$items' },
        { $match: { 'items.vendor': vendorObjectId } },
        {
          $group: {
            _id: {
              orderId: '$_id',
              itemStatus: '$items.status',
              paymentStatus: '$paymentStatus'
            },
            vendorAmount: { $sum: { $ifNull: ['$items.subtotal', { $multiply: ['$items.price', '$items.quantity'] }] } }
          }
        },
        {
          $group: {
            _id: {
              itemStatus: '$_id.itemStatus',
              paymentStatus: '$_id.paymentStatus'
            },
            orders: { $sum: 1 },
            amount: { $sum: '$vendorAmount' }
          }
        },
        {
          $project: {
            _id: 0,
            itemStatus: '$_id.itemStatus',
            paymentStatus: '$_id.paymentStatus',
            orders: 1,
            amount: 1
          }
        }
      ]),
      Order.aggregate([
        { $match: { 'items.vendor': vendorObjectId } },
        { $unwind: '$items' },
        { $match: { 'items.vendor': vendorObjectId } },
        {
          $group: {
            _id: '$_id',
            paymentStatus: { $first: '$paymentStatus' },
            createdAt: { $first: '$createdAt' },
            vendorOrderAmount: {
              $sum: { $ifNull: ['$items.subtotal', { $multiply: ['$items.price', '$items.quantity'] }] }
            }
          }
        },
        {
          $group: {
            _id: null,
            gmvTotal: {
              $sum: {
                $cond: [{ $eq: [{ $toUpper: { $ifNull: ['$paymentStatus', ''] } }, 'PAID'] }, '$vendorOrderAmount', 0]
              }
            },
            gmv7d: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: [{ $toUpper: { $ifNull: ['$paymentStatus', ''] } }, 'PAID'] },
                      { $gte: ['$createdAt', sevenDaysAgo] }
                    ]
                  },
                  '$vendorOrderAmount',
                  0
                ]
              }
            }
          }
        }
      ]),
      Product.find({ vendor: vendorObjectId })
        .select('_id name title status createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Order.aggregate([
        { $match: { 'items.vendor': vendorObjectId } },
        { $sort: { createdAt: -1 } },
        { $limit: 50 },
        {
          $project: {
            _id: 1,
            orderNumber: 1,
            createdAt: 1,
            customer: 1,
            paymentStatus: 1,
            items: {
              $filter: {
                input: '$items',
                as: 'item',
                cond: { $eq: ['$$item.vendor', vendorObjectId] }
              }
            }
          }
        },
        {
          $addFields: {
            vendorStatus: {
              $arrayElemAt: [
                {
                  $map: {
                    input: '$items',
                    as: 'item',
                    in: '$$item.status'
                  }
                },
                0
              ]
            },
            vendorTotal: {
              $sum: {
                $map: {
                  input: '$items',
                  as: 'item',
                  in: { $ifNull: ['$$item.subtotal', { $multiply: ['$$item.price', '$$item.quantity'] }] }
                }
              }
            }
          }
        },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: 'customer',
            foreignField: '_id',
            as: 'customer'
          }
        },
        { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            id: '$_id',
            orderNumber: 1,
            createdAt: 1,
            status: '$vendorStatus',
            total: '$vendorTotal',
            customer: {
              id: '$customer._id',
              name: '$customer.name',
              email: '$customer.email'
            }
          }
        }
      ])
    ]);

    const products = { total: 0, published: 0, pending: 0, draft: 0, rejected: 0, inactive: 0 };
    for (const row of productAgg) {
      products.total += row.count || 0;
      const bucket = mapProductStatus(row.status, row.isActive).toLowerCase();
      if (Object.prototype.hasOwnProperty.call(products, bucket)) products[bucket] += row.count || 0;
    }

    const orders = {
      total: 0,
      byStatus: { pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 },
      paidCount: 0,
      unpaidCount: 0
    };

    for (const row of vendorOrderAgg) {
      orders.total += row.orders || 0;
      const statusBucket = toOrderStatusBucket(row.itemStatus);
      if (Object.prototype.hasOwnProperty.call(orders.byStatus, statusBucket)) {
        orders.byStatus[statusBucket] += row.orders || 0;
      }
      if (isPaidStatus(row.paymentStatus)) orders.paidCount += row.orders || 0;
      else orders.unpaidCount += row.orders || 0;
    }

    const data = {
      vendor: { id: vendor._id, storeName: vendor.storeName },
      stats: {
        products,
        orders,
        revenue: {
          gmvTotal: Number((revenueAgg[0]?.gmvTotal || 0).toFixed(2)),
          gmv7d: Number((revenueAgg[0]?.gmv7d || 0).toFixed(2))
        }
      },
      recent: {
        products: recentProducts.map((product) => ({
          id: product._id,
          title: product.title || product.name,
          status: product.status,
          createdAt: product.createdAt
        })),
        orders: recentOrders
      },
      generatedAt: new Date().toISOString()
    };

    setCache(cacheKey, data);
    res.set('Cache-Control', 'private, max-age=15');
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

