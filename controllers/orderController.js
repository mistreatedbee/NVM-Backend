const Order = require('../models/Order');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const Transaction = require('../models/Transaction');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const AuditLog = require('../models/AuditLog');
const OrderStatusHistory = require('../models/OrderStatusHistory');
const Invoice = require('../models/Invoice');
const User = require('../models/User');
const PromoCode = require('../models/PromoCode');
const GiftCard = require('../models/GiftCard');
const VendorCoupon = require('../models/VendorCoupon');
const FlashSale = require('../models/FlashSale');
const { notifyUser } = require('../services/notificationService');
const { buildAppUrl } = require('../utils/appUrl');
const { issueInvoicesForOrder } = require('../services/invoiceService');
const { recordPurchaseEventsForOrder } = require('../services/productAnalyticsService');
const { logActivity, resolveIp } = require('../services/loggingService');

function calculatePromoDiscount(subtotal, promo) {
  if (!promo) return 0;
  if (promo.discountType === 'PERCENT') return Math.max(0, Math.min(subtotal, (subtotal * promo.amount) / 100));
  return Math.max(0, Math.min(subtotal, promo.amount));
}

function normalizeVendorCouponInputs(payload = {}) {
  if (Array.isArray(payload.vendorCoupons)) return payload.vendorCoupons;
  if (Array.isArray(payload.vendorCouponCodes)) {
    return payload.vendorCouponCodes.map((item) =>
      typeof item === 'string' ? { code: item } : item
    );
  }
  if (payload.vendorCouponCode) return [{ code: payload.vendorCouponCode, vendorId: payload.vendorId }];
  return [];
}

// @desc    Create new order
// @route   POST /api/orders
// @access  Private (Customer)
exports.createOrder = async (req, res, next) => {
  try {
    const {
      items,
      shippingAddress,
      billingAddress,
      paymentMethod,
      customerNotes,
      promoCode,
      giftCardCode,
      deliveryMethod
    } = req.body;

    const requestedPaymentMethod = String(paymentMethod || 'INVOICE').toUpperCase();
    if (!['INVOICE', 'EFT'].includes(requestedPaymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Only Pay via Invoice (Manual EFT) is currently available'
      });
    }

    // Validate items and calculate totals
    let subtotal = 0;
    let shippingCost = 0;
    const orderItems = [];
    const vendorSubtotals = new Map();

    for (const item of items) {
      const product = await Product.findById(item.product);
      
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product ${item.product} not found`
        });
      }

      if (product.status !== 'PUBLISHED' || !product.isActive) {
        return res.status(400).json({
          success: false,
          message: `Product ${product.name} is not available`
        });
      }

      if (product.trackInventory && product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}`
        });
      }

      const flashSale = await FlashSale.findOne({
        active: true,
        productIds: product._id,
        startAt: { $lte: new Date() },
        endAt: { $gte: new Date() }
      }).select('discount');
      const flashSaleDiscountPercent = flashSale ? Number(flashSale.discount || 0) : 0;
      const unitPrice = flashSaleDiscountPercent > 0
        ? Number((product.price * (1 - flashSaleDiscountPercent / 100)).toFixed(2))
        : product.price;
      const itemSubtotal = unitPrice * item.quantity;
      subtotal += itemSubtotal;
      const vendorKey = String(product.vendor);
      vendorSubtotals.set(vendorKey, (vendorSubtotals.get(vendorKey) || 0) + itemSubtotal);
      
      if (!product.shipping.freeShipping) {
        shippingCost += product.shipping.shippingCost || 0;
      }

      orderItems.push({
        product: product._id,
        productId: product._id,
        vendor: product.vendor,
        vendorId: product.vendor,
        name: product.name,
        titleSnapshot: product.name,
        image: product.images[0]?.url,
        price: unitPrice,
        priceSnapshot: unitPrice,
        quantity: item.quantity,
        qty: item.quantity,
        variant: item.variant,
        subtotal: itemSubtotal,
        lineTotal: itemSubtotal,
        status: 'PENDING',
        updatedAt: new Date()
      });
    }

    const tax = subtotal * 0.1; // 10% tax
    let discount = 0;
    const appliedVendorCoupons = [];

    let promoDoc = null;
    if (promoCode) {
      promoDoc = await PromoCode.findOne({ code: String(promoCode).trim().toUpperCase(), active: true });
      if (!promoDoc) return res.status(400).json({ success: false, message: 'Promo code is invalid' });
      if (promoDoc.expiresAt && promoDoc.expiresAt < new Date()) {
        return res.status(400).json({ success: false, message: 'Promo code has expired' });
      }
      if (promoDoc.maxUses > 0 && promoDoc.usedCount >= promoDoc.maxUses) {
        return res.status(400).json({ success: false, message: 'Promo code usage limit reached' });
      }
      if (subtotal < (promoDoc.minSpend || 0)) {
        return res.status(400).json({ success: false, message: `Promo requires minimum spend of ${promoDoc.minSpend}` });
      }
      discount += calculatePromoDiscount(subtotal, promoDoc);
    }

    const vendorCouponInputs = normalizeVendorCouponInputs(req.body);
    for (const input of vendorCouponInputs) {
      const code = String(input?.code || '').trim().toUpperCase();
      if (!code) continue;
      const coupon = await VendorCoupon.findOne({ code, active: true });
      if (!coupon) continue;
      const now = new Date();
      if (coupon.startAt && coupon.startAt > now) continue;
      if (coupon.endAt && coupon.endAt < now) continue;
      if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) continue;

      const vendorSubtotal = vendorSubtotals.get(String(coupon.vendorId)) || 0;
      if (vendorSubtotal < (coupon.minSpend || 0)) continue;
      const couponDiscount = calculatePromoDiscount(vendorSubtotal, coupon);
      if (couponDiscount <= 0) continue;
      discount += couponDiscount;
      appliedVendorCoupons.push({ coupon, discount: couponDiscount });
    }

    let giftCardDoc = null;
    let giftCardApplied = 0;
    if (giftCardCode) {
      giftCardDoc = await GiftCard.findOne({ code: String(giftCardCode).trim().toUpperCase(), active: true });
      if (!giftCardDoc) return res.status(400).json({ success: false, message: 'Gift card is invalid' });
      if (giftCardDoc.expiresAt && giftCardDoc.expiresAt < new Date()) {
        return res.status(400).json({ success: false, message: 'Gift card has expired' });
      }
      giftCardApplied = Math.min(giftCardDoc.balance, Math.max(0, subtotal + shippingCost + tax - discount));
      discount += giftCardApplied;
    }

    const total = Math.max(0, subtotal + shippingCost + tax - discount);

    // Create order
    const order = await Order.create({
      customer: req.user.id,
      customerId: req.user.id,
      items: orderItems,
      subtotal,
      shippingCost,
      deliveryFee: shippingCost,
      tax,
      discount,
      total,
      shippingAddress,
      deliveryAddress: shippingAddress,
      billingAddress: billingAddress || shippingAddress,
      paymentMethod: 'INVOICE',
      paymentStatus: 'AWAITING_PAYMENT',
      orderStatus: 'PENDING',
      deliveryMethod: String(deliveryMethod || 'DELIVERY').toUpperCase() === 'PICKUP' ? 'PICKUP' : 'DELIVERY',
      totals: {
        subtotal,
        delivery: shippingCost,
        discount,
        total
      },
      customerNotes
    });

    if (promoDoc) {
      promoDoc.usedCount += 1;
      await promoDoc.save();
    }
    for (const entry of appliedVendorCoupons) {
      entry.coupon.usedCount += 1;
      await entry.coupon.save();
    }
    if (giftCardDoc && giftCardApplied > 0) {
      giftCardDoc.balance = Number(Math.max(0, giftCardDoc.balance - giftCardApplied).toFixed(2));
      if (giftCardDoc.balance <= 0) giftCardDoc.active = false;
      await giftCardDoc.save();
    }

    await logActivity({
      userId: req.user.id,
      role: req.user.role,
      action: 'ORDER_PLACED',
      entityType: 'ORDER',
      entityId: order._id,
      metadata: {
        orderNumber: order.orderNumber,
        total: order.total,
        itemsCount: order.items?.length || 0
      },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
    });

    await issueInvoicesForOrder({ orderId: order._id, actorId: req.user.id, force: true });

    await OrderStatusHistory.create({
      orderId: order._id,
      actorId: req.user.id,
      actorRole: 'CUSTOMER',
      level: 'ORDER',
      fromStatus: null,
      toStatus: 'PENDING',
      note: 'Order placed'
    });

    // Update product stock
    for (const item of orderItems) {
      const product = await Product.findById(item.product);
      if (product.trackInventory) {
        product.stock -= item.quantity;
        product.totalSales += item.quantity;
        await product.save();
      }
    }

    await notifyUser({
      user: req.user,
      type: 'ORDER',
      subType: 'ORDER_PLACED',
      title: 'Order placed successfully',
      message: `Your order ${order.orderNumber} has been placed.`,
      linkUrl: `/orders/${order._id}/track`,
      metadata: {
        event: 'order.placed',
        orderId: order._id.toString(),
        orderNumber: order.orderNumber
      },
      emailTemplate: 'order_confirmation',
      emailContext: {
        orderId: order.orderNumber,
        actionLinks: [{ label: 'Track order', url: buildAppUrl(`/orders/${order._id}/track`) }]
      },
      actor: {
        actorId: req.user.id,
        actorRole: 'Customer',
        action: 'order.customer-notified',
        entityType: 'Order'
      }
    });

    // Create notifications for vendors
    const vendors = [...new Set(orderItems.map(item => item.vendor.toString()))];
    for (const vendorId of vendors) {
      // Notification model targets a User, but order items store a Vendor reference.
      // Resolve vendor -> user so notifications validate and show up for vendor accounts.
      const vendor = await Vendor.findById(vendorId).select('user');
      if (!vendor?.user) continue;

      const vendorUser = await User.findById(vendor.user).select('name email role');
      if (!vendorUser) continue;

      await notifyUser({
        user: vendorUser,
        type: 'ORDER',
        subType: 'NEW_ORDER_RECEIVED',
        title: 'New order received',
        message: `You received order ${order.orderNumber}.`,
        linkUrl: `/vendor/orders/${order._id}`,
        metadata: {
          event: 'order.new-for-vendor',
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          vendorId
        },
        emailTemplate: 'new_order_vendor',
        emailContext: {
          orderId: order.orderNumber,
          actionLinks: [{ label: 'Open order', url: buildAppUrl(`/vendor/orders/${order._id}`) }]
        },
        actor: {
          actorId: req.user.id,
          actorRole: 'Customer',
          action: 'order.vendor-notified',
          entityType: 'Order'
        }
      });
    }

    await notifyUser({
      user: req.user,
      type: 'ORDER',
      subType: 'INVOICE_AVAILABLE',
      title: 'Invoice available',
      message: `Invoice for order ${order.orderNumber} is ready.`,
      linkUrl: `/orders/${order._id}/invoice`,
      metadata: {
        event: 'invoice.ready',
        orderId: order._id.toString(),
        orderNumber: order.orderNumber
      },
      emailTemplate: 'invoice_available',
      emailContext: {
        orderId: order.orderNumber,
        actionLinks: [{ label: 'View invoice', url: buildAppUrl(`/orders/${order._id}/invoice`) }]
      },
      actor: {
        actorId: req.user.id,
        actorRole: 'Customer',
        action: 'invoice.customer-notified',
        entityType: 'Order'
      }
    });

    // Auto-create order conversations (one thread per vendor in the order)
    for (const vendorId of vendors) {
      const vendor = await Vendor.findById(vendorId).select('_id user');
      if (!vendor?.user) continue;

      let conversation = await Conversation.findOne({
        type: 'order',
        orderId: order._id,
        vendorId: vendor._id,
        customerId: req.user.id
      });

      if (!conversation) {
        conversation = await Conversation.create({
          type: 'order',
          participantIds: [req.user.id, vendor.user],
          customerId: req.user.id,
          vendorUserId: vendor.user,
          vendorId: vendor._id,
          orderId: order._id,
          orderStatusSnapshot: order.status,
          createdBy: req.user.id,
          supportStatus: 'Open',
          lastMessage: `Order ${order.orderNumber} conversation started.`,
          lastMessageAt: new Date()
        });

        const systemMessage = await Message.create({
          conversationId: conversation._id,
          senderId: null,
          senderRole: 'System',
          messageContent: `Order ${order.orderNumber} conversation started. Current status: ${order.status}.`,
          messageType: 'system'
        });

        await AuditLog.create({
          actorId: req.user.id,
          actorRole: 'Customer',
          action: 'conversation.created',
          entityType: 'Conversation',
          entityId: conversation._id,
          metadata: {
            trigger: 'order.created',
            messageId: systemMessage._id,
            orderId: order._id,
            vendorId: vendor._id
          }
        });
      }
    }

    const invoices = await Invoice.find({ orderId: order._id }).select('_id invoiceNumber type issuedAt').lean();
    res.status(201).json({
      success: true,
      data: order,
      invoices
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all orders (Admin)
// @route   GET /api/orders
// @access  Private (Admin)
exports.getAllOrders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const query = {};
    
    if (req.query.status) {
      query.status = req.query.status;
    }

    const orders = await Order.find(query)
      .populate('customer', 'name email')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments(query);

    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: orders
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
exports.getOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'name email phone')
      .populate('items.product', 'name images')
      .populate('items.vendor', 'storeName');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check authorization
    if (
      order.customer._id.toString() !== req.user.id &&
      req.user.role !== 'admin'
    ) {
      // Check if user is vendor for any item
      const isVendor = order.items.some(
        item => item.vendor.user && item.vendor.user.toString() === req.user.id
      );

      if (!isVendor) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this order'
        });
      }
    }

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get my orders (Customer)
// @route   GET /api/orders/my/orders
// @access  Private (Customer)
exports.getMyOrders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const orders = await Order.find({ customer: req.user.id })
      .populate('items.product', 'name images')
      .populate('items.vendor', 'storeName')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments({ customer: req.user.id });

    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: orders
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get vendor orders
// @route   GET /api/orders/vendor/orders
// @access  Private (Vendor)
exports.getVendorOrders = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user.id });
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const orders = await Order.find({
      'items.vendor': vendor._id
    })
      .populate('customer', 'name email phone')
      .populate('items.product', 'name images')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments({
      'items.vendor': vendor._id
    });

    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: orders
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private (Vendor/Admin)
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const { status } = req.body;

    order.status = status;

    // Update timestamps
    if (status === 'confirmed') {
      order.confirmedAt = Date.now();
    } else if (status === 'shipped') {
      order.shippedAt = Date.now();
    } else if (status === 'delivered') {
      order.deliveredAt = Date.now();
    } else if (status === 'cancelled') {
      order.cancelledAt = Date.now();
    }

    await order.save();
    if (status === 'confirmed') {
      await recordPurchaseEventsForOrder({ order, source: 'DIRECT', actorUserId: req.user.id });
    }

    const customer = await User.findById(order.customer).select('name email role');
    if (customer) {
      let customerEmailTemplate = 'order_status_update';
      if (status === 'delivered') customerEmailTemplate = 'order_delivered';
      if (status === 'cancelled') customerEmailTemplate = 'order_cancelled';

      await notifyUser({
        user: customer,
        type: 'ORDER',
        subType: status === 'confirmed' ? 'ORDER_CONFIRMED' : 'ORDER_STATUS_UPDATED',
        title: `Order status: ${status}`,
        message: `Your order ${order.orderNumber} is now ${status}.`,
        linkUrl: `/orders/${order._id}/track`,
        metadata: {
          event: 'order.status.updated',
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          status
        },
        emailTemplate: customerEmailTemplate,
        emailContext: {
          orderId: order.orderNumber,
          status,
          actionLinks: [{ label: 'Track order', url: buildAppUrl(`/orders/${order._id}/track`) }]
        },
        actor: {
          actorId: req.user.id,
          actorRole: req.user.role === 'admin' ? 'Admin' : 'Vendor',
          action: 'order.status-notified',
          entityType: 'Order'
        }
      });
    }

    if (status === 'cancelled' && customer) {
      await notifyUser({
        user: customer,
        type: 'ORDER',
        subType: 'ORDER_CANCELLED',
        title: 'Order cancelled',
        message: `Order ${order.orderNumber} has been cancelled.`,
        linkUrl: `/orders/${order._id}/track`,
        metadata: { event: 'order.cancelled', orderId: order._id.toString() }
      });
    }
    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private (Customer/Admin)
exports.cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check authorization
    if (order.customer.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this order'
      });
    }

    if (order.status === 'delivered' || order.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel this order'
      });
    }

    order.status = 'cancelled';
    order.cancelledAt = Date.now();
    order.cancellationReason = req.body.reason;
    await order.save();

    // Restore product stock
    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (product && product.trackInventory) {
        product.stock += item.quantity;
        product.totalSales = Math.max(0, product.totalSales - item.quantity);
        await product.save();
      }
    }

    const customer = await User.findById(order.customer).select('name email role');
    if (customer) {
      await notifyUser({
        user: customer,
        type: 'ORDER',
        subType: 'ORDER_CANCELLED',
        title: 'Order cancelled',
        message: `Order ${order.orderNumber} has been cancelled.`,
        linkUrl: `/orders/${order._id}/track`,
        metadata: {
          event: 'order.cancelled',
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          reason: req.body.reason || null
        }
      });
    }

    const vendorIds = [...new Set(order.items.map((item) => String(item.vendor || item.vendorId)))];
    for (const vendorId of vendorIds) {
      const vendor = await Vendor.findById(vendorId).select('user');
      if (!vendor?.user) continue;

      const vendorUser = await User.findById(vendor.user).select('name email role');
      if (!vendorUser) continue;

      await notifyUser({
        user: vendorUser,
        type: 'ORDER',
        subType: 'ORDER_CANCELLED',
        title: 'Order cancelled',
        message: `Order ${order.orderNumber} was cancelled and affects your items.`,
        linkUrl: `/vendor/orders/${order._id}`,
        metadata: {
          event: 'order.cancelled.vendor-impact',
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          vendorId
        }
      });
    }

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
};
