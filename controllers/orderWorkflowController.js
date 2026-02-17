const mongoose = require('mongoose');
const Order = require('../models/Order');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Product = require('../models/Product');
const AuditLog = require('../models/AuditLog');
const OrderStatusHistory = require('../models/OrderStatusHistory');
const {
  ITEM_STATUSES,
  ORDER_STATUSES,
  normalizeItemStatus,
  normalizeOrderStatus,
  canTransitionVendorItemStatus,
  computeOverallOrderStatus,
  mapOrderStatusToLegacy
} = require('../utils/orderWorkflow');

const asString = (value) => (value ? String(value) : '');
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

function getActorRole(user) {
  if (!user) return 'SYSTEM';
  if (user.role === 'admin') return 'ADMIN';
  if (user.role === 'vendor') return 'VENDOR';
  return 'CUSTOMER';
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function normalizeOrder(orderDoc) {
  const order = orderDoc.toObject ? orderDoc.toObject() : orderDoc;
  const items = (order.items || []).map((item) => {
    const productId = item.productId || item.product?._id || item.product;
    const vendorId = item.vendorId || item.vendor?._id || item.vendor;
    const status = normalizeItemStatus(item.status);
    return {
      ...item,
      productId,
      vendorId,
      titleSnapshot: item.titleSnapshot || item.name,
      priceSnapshot: item.priceSnapshot ?? item.price,
      qty: item.qty ?? item.quantity,
      lineTotal: item.lineTotal ?? item.subtotal,
      status
    };
  });

  const orderStatus = normalizeOrderStatus(order.orderStatus || order.status);

  return {
    ...order,
    customerId: order.customerId || order.customer?._id || order.customer,
    orderStatus,
    paymentStatus: typeof order.paymentStatus === 'string' ? order.paymentStatus.toUpperCase() : order.paymentStatus,
    deliveryMethod: order.deliveryMethod || (order.fulfillmentMethod === 'collection' ? 'PICKUP' : 'DELIVERY'),
    deliveryAddress: order.deliveryAddress || order.shippingAddress,
    deliveryFee: order.deliveryFee ?? order.shippingCost ?? 0,
    totals: order.totals || {
      subtotal: order.subtotal ?? 0,
      delivery: order.deliveryFee ?? order.shippingCost ?? 0,
      discount: order.discount ?? 0,
      total: order.total ?? 0
    },
    items
  };
}

function filterVendorItems(order, vendorId) {
  const normalized = normalizeOrder(order);
  const vendorItems = normalized.items.filter((item) => asString(item.vendorId) === asString(vendorId));
  return {
    ...normalized,
    items: vendorItems
  };
}

async function logHistory(entries) {
  if (!entries.length) return;
  await OrderStatusHistory.insertMany(entries);
}

function findOrderItem(order, vendorId, productId) {
  return (order.items || []).find((item) => {
    const itemVendorId = item.vendorId || item.vendor;
    const itemProductId = item.productId || item.product;
    return asString(itemVendorId) === asString(vendorId) && asString(itemProductId) === asString(productId);
  });
}

async function getVendorForUser(userId) {
  return Vendor.findOne({ user: userId }).select('_id user storeName');
}

exports.getMyOrders = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {
      $or: [{ customerId: req.user.id }, { customer: req.user.id }]
    };

    if (req.query.status) {
      const normalized = normalizeOrderStatus(req.query.status);
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { orderStatus: normalized },
          { status: mapOrderStatusToLegacy(normalized) }
        ]
      });
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('items.productId', 'name images')
        .populate('items.vendorId', 'storeName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: orders.map(normalizeOrder)
    });
  } catch (error) {
    next(error);
  }
};

exports.getMyOrderById = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!isObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const order = await Order.findOne({
      _id: orderId,
      $or: [{ customerId: req.user.id }, { customer: req.user.id }]
    })
      .populate('customerId', 'name email')
      .populate('items.productId', 'name images')
      .populate('items.vendorId', 'storeName');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const timeline = await OrderStatusHistory.find({ orderId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        order: normalizeOrder(order),
        timeline
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getMyOrderTracking = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!isObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const order = await Order.findOne({
      _id: orderId,
      $or: [{ customerId: req.user.id }, { customer: req.user.id }]
    })
      .populate('items.vendorId', 'storeName')
      .populate('items.productId', 'name images');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const timeline = await OrderStatusHistory.find({ orderId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderStatus: normalizeOrderStatus(order.orderStatus || order.status),
        items: normalizeOrder(order).items,
        timeline
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getVendorOrders = async (req, res, next) => {
  try {
    const vendor = await getVendorForUser(req.user.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    }

    const { page, limit, skip } = parsePagination(req.query);
    const query = {
      items: {
        $elemMatch: {
          $or: [{ vendorId: vendor._id }, { vendor: vendor._id }]
        }
      }
    };

    if (req.query.status) {
      const normalized = normalizeItemStatus(req.query.status);
      query.items.$elemMatch.status = { $in: [normalized, normalized.toLowerCase()] };
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('customerId', 'name email phone')
        .populate('items.productId', 'name images')
        .populate('items.vendorId', 'storeName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(query)
    ]);

    const data = orders
      .map((order) => filterVendorItems(order, vendor._id))
      .filter((order) => order.items.length > 0);

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data
    });
  } catch (error) {
    next(error);
  }
};

exports.getVendorOrderById = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!isObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const vendor = await getVendorForUser(req.user.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    }

    const order = await Order.findOne({
      _id: orderId,
      items: {
        $elemMatch: {
          $or: [{ vendorId: vendor._id }, { vendor: vendor._id }]
        }
      }
    })
      .populate('customerId', 'name email phone')
      .populate('items.productId', 'name images')
      .populate('items.vendorId', 'storeName');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const timeline = await OrderStatusHistory.find({
      orderId,
      $or: [{ level: 'ORDER' }, { itemVendorId: vendor._id }]
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        order: filterVendorItems(order, vendor._id),
        timeline
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.updateVendorItemStatus = async (req, res, next) => {
  try {
    const { orderId, productId } = req.params;
    const { status, note } = req.body;

    if (!isObjectId(orderId) || !isObjectId(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid ids supplied' });
    }

    const newStatus = normalizeItemStatus(status);
    if (!ITEM_STATUSES.includes(newStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const vendor = await getVendorForUser(req.user.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = findOrderItem(order, vendor._id, productId);
    if (!item) {
      return res.status(403).json({ success: false, message: 'Not authorized for this item' });
    }

    const previousItemStatus = normalizeItemStatus(item.status);
    const transition = canTransitionVendorItemStatus(previousItemStatus, newStatus);
    if (!transition.allowed) {
      return res.status(400).json({ success: false, message: transition.reason });
    }

    item.status = newStatus;
    item.updatedAt = new Date();
    if (note) {
      item.fulfilmentNotes = note;
      item.vendorNotes = note;
    }

    const previousOrderStatus = normalizeOrderStatus(order.orderStatus || order.status);
    const newOrderStatus = computeOverallOrderStatus(order.items);
    order.orderStatus = newOrderStatus;
    order.status = mapOrderStatusToLegacy(newOrderStatus);
    if (newStatus === 'DELIVERED') {
      order.deliveredAt = new Date();
    }
    if (newStatus === 'SHIPPED') {
      order.shippedAt = new Date();
    }
    if (newStatus === 'CANCELLED') {
      order.cancelledAt = new Date();
    }

    await order.save();

    const historyEntries = [
      {
        orderId: order._id,
        actorId: req.user.id,
        actorRole: getActorRole(req.user),
        level: 'ITEM',
        itemProductId: item.productId || item.product,
        itemVendorId: item.vendorId || item.vendor,
        fromStatus: previousItemStatus,
        toStatus: newStatus,
        note: note || ''
      }
    ];

    if (previousOrderStatus !== newOrderStatus) {
      historyEntries.push({
        orderId: order._id,
        actorId: req.user.id,
        actorRole: getActorRole(req.user),
        level: 'ORDER',
        fromStatus: previousOrderStatus,
        toStatus: newOrderStatus,
        note: 'Derived from item fulfilment update'
      });
    }

    await logHistory(historyEntries);

    res.status(200).json({
      success: true,
      message: 'Item status updated',
      data: filterVendorItems(order, vendor._id)
    });
  } catch (error) {
    next(error);
  }
};

exports.updateVendorItemTracking = async (req, res, next) => {
  try {
    const { orderId, productId } = req.params;
    const { carrier, trackingNumber, trackingUrl } = req.body;

    if (!isObjectId(orderId) || !isObjectId(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid ids supplied' });
    }

    const vendor = await getVendorForUser(req.user.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = findOrderItem(order, vendor._id, productId);
    if (!item) {
      return res.status(403).json({ success: false, message: 'Not authorized for this item' });
    }

    item.tracking = {
      carrier: carrier || item.tracking?.carrier || '',
      trackingNumber: trackingNumber || item.tracking?.trackingNumber || '',
      trackingUrl: trackingUrl || item.tracking?.trackingUrl || '',
      lastUpdatedAt: new Date()
    };
    item.updatedAt = new Date();

    await order.save();

    await logHistory([{
      orderId: order._id,
      actorId: req.user.id,
      actorRole: getActorRole(req.user),
      level: 'ITEM',
      itemProductId: item.productId || item.product,
      itemVendorId: item.vendorId || item.vendor,
      fromStatus: normalizeItemStatus(item.status),
      toStatus: normalizeItemStatus(item.status),
      note: 'Tracking updated'
    }]);

    res.status(200).json({
      success: true,
      message: 'Tracking updated',
      data: filterVendorItems(order, vendor._id)
    });
  } catch (error) {
    next(error);
  }
};

exports.getAdminOrders = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};

    if (req.query.status) {
      const normalized = normalizeOrderStatus(req.query.status);
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { orderStatus: normalized },
          { status: mapOrderStatusToLegacy(normalized) }
        ]
      });
    }
    if (req.query.paymentStatus) {
      query.paymentStatus = String(req.query.paymentStatus).toUpperCase();
    }
    if (req.query.vendorId && isObjectId(req.query.vendorId)) {
      query.$or = [{ 'items.vendorId': req.query.vendorId }, { 'items.vendor': req.query.vendorId }];
    }
    if (req.query.customerId && isObjectId(req.query.customerId)) {
      query.$and = query.$and || [];
      query.$and.push({ $or: [{ customerId: req.query.customerId }, { customer: req.query.customerId }] });
    }

    if (req.query.q) {
      const q = String(req.query.q).trim();
      const customerMatches = await User.find({
        $or: [{ name: { $regex: q, $options: 'i' } }, { email: { $regex: q, $options: 'i' } }]
      }).select('_id');

      const qConditions = [{ orderNumber: { $regex: q, $options: 'i' } }];
      if (isObjectId(q)) qConditions.push({ _id: q });
      if (customerMatches.length) {
        qConditions.push({ customerId: { $in: customerMatches.map((c) => c._id) } });
        qConditions.push({ customer: { $in: customerMatches.map((c) => c._id) } });
      }

      query.$and = query.$and || [];
      query.$and.push({ $or: qConditions });
    }

    if (req.query.dateFrom || req.query.dateTo) {
      query.createdAt = {};
      if (req.query.dateFrom) {
        query.createdAt.$gte = new Date(req.query.dateFrom);
      }
      if (req.query.dateTo) {
        const to = new Date(req.query.dateTo);
        to.setHours(23, 59, 59, 999);
        query.createdAt.$lte = to;
      }
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('customerId', 'name email phone')
        .populate('items.vendorId', 'storeName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: orders.map(normalizeOrder)
    });
  } catch (error) {
    next(error);
  }
};

exports.getAdminOrderById = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!isObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const order = await Order.findById(orderId)
      .populate('customerId', 'name email phone')
      .populate('items.productId', 'name images')
      .populate('items.vendorId', 'storeName email phone');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const timeline = await OrderStatusHistory.find({ orderId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        order: normalizeOrder(order),
        timeline
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.adminUpdateOrderStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { status, reason } = req.body;

    if (!isObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const nextStatus = normalizeOrderStatus(status);
    if (!ORDER_STATUSES.includes(nextStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const previousStatus = normalizeOrderStatus(order.orderStatus || order.status);
    order.orderStatus = nextStatus;
    order.status = mapOrderStatusToLegacy(nextStatus);

    if (nextStatus === 'CANCELLED') {
      order.cancelledAt = new Date();
    }
    if (nextStatus === 'DELIVERED') {
      order.deliveredAt = new Date();
    }

    await order.save();

    await logHistory([{
      orderId: order._id,
      actorId: req.user.id,
      actorRole: 'ADMIN',
      level: 'ORDER',
      fromStatus: previousStatus,
      toStatus: nextStatus,
      note: reason || 'Admin override'
    }]);

    await AuditLog.create({
      actorId: req.user.id,
      actorRole: 'Admin',
      action: 'ORDER_STATUS_UPDATE',
      entityType: 'Order',
      entityId: order._id,
      metadata: {
        previousStatus,
        newStatus: nextStatus,
        reason: reason || ''
      }
    });

    res.status(200).json({
      success: true,
      message: 'Order status updated',
      data: normalizeOrder(order)
    });
  } catch (error) {
    next(error);
  }
};

exports.adminCancelOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { reason, items = [] } = req.body;

    if (!isObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ success: false, message: 'Cancellation reason is required' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const affectedItems = [];
    const targetedProducts = new Set(
      items
        .filter((item) => isObjectId(item.productId))
        .map((item) => `${item.productId}:${item.vendorId || ''}`)
    );

    const updates = [];
    for (const item of order.items) {
      const itemProductId = asString(item.productId || item.product);
      const itemVendorId = asString(item.vendorId || item.vendor);
      const itemKey = `${itemProductId}:${itemVendorId}`;
      const shouldCancel = targetedProducts.size === 0 || targetedProducts.has(itemKey) || targetedProducts.has(`${itemProductId}:`);

      if (!shouldCancel) continue;

      const previousItemStatus = normalizeItemStatus(item.status);
      if (previousItemStatus === 'DELIVERED' || previousItemStatus === 'REFUNDED') {
        continue;
      }
      if (previousItemStatus === 'CANCELLED') {
        continue;
      }

      item.status = 'CANCELLED';
      item.updatedAt = new Date();
      affectedItems.push({
        productId: itemProductId,
        vendorId: itemVendorId,
        fromStatus: previousItemStatus,
        toStatus: 'CANCELLED'
      });

      updates.push({
        orderId: order._id,
        actorId: req.user.id,
        actorRole: 'ADMIN',
        level: 'ITEM',
        itemProductId: item.productId || item.product,
        itemVendorId: item.vendorId || item.vendor,
        fromStatus: previousItemStatus,
        toStatus: 'CANCELLED',
        note: reason
      });

      const productId = item.productId || item.product;
      const product = await Product.findById(productId);
      if (product?.trackInventory) {
        const qty = item.qty || item.quantity || 0;
        product.stock += qty;
        product.totalSales = Math.max(0, (product.totalSales || 0) - qty);
        await product.save();
      }
    }

    if (!affectedItems.length) {
      return res.status(400).json({
        success: false,
        message: 'No cancellable items found for this request'
      });
    }

    const previousOrderStatus = normalizeOrderStatus(order.orderStatus || order.status);
    const nextOrderStatus = computeOverallOrderStatus(order.items);
    order.orderStatus = nextOrderStatus;
    order.status = mapOrderStatusToLegacy(nextOrderStatus);
    order.cancelledAt = new Date();
    order.cancellationReason = reason;
    await order.save();

    updates.push({
      orderId: order._id,
      actorId: req.user.id,
      actorRole: 'ADMIN',
      level: 'ORDER',
      fromStatus: previousOrderStatus,
      toStatus: nextOrderStatus,
      note: reason
    });
    await logHistory(updates);

    await AuditLog.create({
      actorId: req.user.id,
      actorRole: 'Admin',
      action: 'ORDER_CANCEL',
      entityType: 'Order',
      entityId: order._id,
      metadata: {
        previousStatus: previousOrderStatus,
        newStatus: nextOrderStatus,
        reason,
        affectedItems
      }
    });

    res.status(200).json({
      success: true,
      message: 'Order cancellation processed',
      data: normalizeOrder(order)
    });
  } catch (error) {
    next(error);
  }
};
