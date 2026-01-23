const Order = require('../models/Order');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const { sendEmail, orderConfirmationEmail } = require('../utils/email');

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
      customerNotes
    } = req.body;

    // Validate items and calculate totals
    let subtotal = 0;
    let shippingCost = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product);
      
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product ${item.product} not found`
        });
      }

      if (product.status !== 'active') {
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

      const itemSubtotal = product.price * item.quantity;
      subtotal += itemSubtotal;
      
      if (!product.shipping.freeShipping) {
        shippingCost += product.shipping.shippingCost || 0;
      }

      orderItems.push({
        product: product._id,
        vendor: product.vendor,
        name: product.name,
        image: product.images[0]?.url,
        price: product.price,
        quantity: item.quantity,
        variant: item.variant,
        subtotal: itemSubtotal
      });
    }

    const tax = subtotal * 0.1; // 10% tax
    const total = subtotal + shippingCost + tax;

    // Create order
    const order = await Order.create({
      customer: req.user.id,
      items: orderItems,
      subtotal,
      shippingCost,
      tax,
      total,
      shippingAddress,
      billingAddress: billingAddress || shippingAddress,
      paymentMethod,
      customerNotes
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

    // Send order confirmation email
    try {
      await sendEmail({
        email: req.user.email,
        subject: 'Order Confirmation - NVM',
        html: orderConfirmationEmail(req.user.name, order.orderNumber, order.total)
      });
    } catch (error) {
      console.error('Order confirmation email failed:', error);
    }

    // Create notifications for vendors
    const vendors = [...new Set(orderItems.map(item => item.vendor.toString()))];
    for (const vendorId of vendors) {
      // Notification model targets a User, but order items store a Vendor reference.
      // Resolve vendor -> user so notifications validate and show up for vendor accounts.
      const vendor = await Vendor.findById(vendorId).select('user');
      if (!vendor?.user) continue;

      await Notification.create({
        user: vendor.user,
        type: 'order',
        title: 'New Order Received',
        message: `You have received a new order ${order.orderNumber}`,
        link: `/vendor/orders/${order._id}`,
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          vendorId
        }
      });
    }

    res.status(201).json({
      success: true,
      data: order
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

    // Create notification for customer
    await Notification.create({
      recipient: order.customer,
      type: `order-${status}`,
      title: `Order ${status}`,
      message: `Your order ${order.orderNumber} has been ${status}`,
      link: `/customer/orders/${order._id}`,
      order: order._id
    });

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

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
};
