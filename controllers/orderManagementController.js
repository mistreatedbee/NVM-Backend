const Order = require('../models/Order');
const Vendor = require('../models/Vendor');
const Product = require('../models/Product');
const User = require('../models/User');
const cloudinary = require('../utils/cloudinary');
const { notifyUser } = require('../services/notificationService');
const { buildAppUrl } = require('../utils/appUrl');

// @desc    Upload payment proof
// @route   POST /api/orders/:orderId/payment-proof
// @access  Private (Customer)
exports.uploadPaymentProof = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check if user is the customer who placed the order
    if (order.customer.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Check if payment method is EFT or Bank Transfer
    if (!['eft', 'bank-transfer'].includes(order.paymentMethod)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment proof only required for EFT/Bank Transfer payments' 
      });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload payment proof image' });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'nvm-payment-proofs',
      resource_type: 'image'
    });

    // Delete old payment proof if exists
    if (order.paymentProof && order.paymentProof.public_id) {
      await cloudinary.uploader.destroy(order.paymentProof.public_id);
    }

    // Update order
    order.paymentProof = {
      public_id: result.public_id,
      url: result.secure_url,
      uploadedAt: new Date()
    };
    order.paymentStatus = 'awaiting-confirmation';

    await order.save();

    const vendorIds = [...new Set(order.items.map((item) => String(item.vendor)))];
    for (const vendorId of vendorIds) {
      const vendor = await Vendor.findById(vendorId).select('user');
      if (!vendor?.user) continue;
      const vendorUser = await User.findById(vendor.user).select('name email role');
      if (!vendorUser) continue;

      await notifyUser({
        user: vendorUser,
        type: 'ORDER',
        title: 'Payment proof uploaded',
        message: `Customer uploaded proof for order ${order.orderNumber}.`,
        linkUrl: `/vendor/orders/${order._id}`,
        metadata: { event: 'order.payment-proof-uploaded', orderId: order._id.toString() }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment proof uploaded successfully',
      data: order
    });
  } catch (error) {
    console.error('Payment proof upload error:', error);
    next(error);
  }
};

// @desc    Confirm payment (Vendor/Admin)
// @route   PUT /api/orders/:orderId/confirm-payment
// @access  Private (Vendor/Admin)
exports.confirmPayment = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId).populate('items.vendor');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check authorization - must be vendor of one of the items or admin
    const isVendor = order.items.some(item => 
      item.vendor && item.vendor.user && item.vendor.user.toString() === req.user.id
    );

    if (req.user.role !== 'admin' && !isVendor) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Payment already confirmed' });
    }

    order.paymentStatus = 'paid';
    order.paidAt = new Date();
    order.paymentConfirmedBy = req.user.id;
    order.paymentConfirmedAt = new Date();
    order.status = 'confirmed';
    order.confirmedAt = new Date();

    await order.save();

    const customer = await User.findById(order.customer).select('name email role');
    if (customer) {
      await notifyUser({
        user: customer,
        type: 'ORDER',
        title: 'Payment confirmed',
        message: `Payment for order ${order.orderNumber} was confirmed.`,
        linkUrl: `/orders/${order._id}/track`,
        metadata: { event: 'order.payment-confirmed', orderId: order._id.toString() },
        emailTemplate: 'order_status_update',
        emailContext: {
          orderId: order.orderNumber,
          status: 'confirmed',
          actionLinks: [{ label: 'Track order', url: buildAppUrl(`/orders/${order._id}/track`) }]
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment confirmed successfully',
      data: order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reject payment
// @route   PUT /api/orders/:orderId/reject-payment
// @access  Private (Vendor/Admin)
exports.rejectPayment = async (req, res, next) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Please provide rejection reason' });
    }

    const order = await Order.findById(req.params.orderId).populate('items.vendor');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check authorization
    const isVendor = order.items.some(item => 
      item.vendor && item.vendor.user && item.vendor.user.toString() === req.user.id
    );

    if (req.user.role !== 'admin' && !isVendor) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    order.paymentStatus = 'failed';
    order.paymentRejectionReason = reason;
    order.paymentConfirmedBy = req.user.id;
    order.paymentConfirmedAt = new Date();

    await order.save();

    const customer = await User.findById(order.customer).select('name email role');
    if (customer) {
      await notifyUser({
        user: customer,
        type: 'ORDER',
        title: 'Payment rejected',
        message: `Payment for order ${order.orderNumber} was rejected: ${reason}`,
        linkUrl: `/orders/${order._id}/track`,
        metadata: { event: 'order.payment-rejected', orderId: order._id.toString(), reason },
        emailTemplate: 'order_status_update',
        emailContext: {
          orderId: order.orderNumber,
          status: 'payment rejected',
          actionLinks: [{ label: 'View order', url: buildAppUrl(`/orders/${order._id}/track`) }]
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment rejected',
      data: order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update order status (Vendor)
// @route   PUT /api/orders/:orderId/status
// @access  Private (Vendor/Admin)
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status, trackingNumber, carrier, estimatedDelivery } = req.body;

    const order = await Order.findById(req.params.orderId).populate('items.vendor');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check authorization
    const isVendor = order.items.some(item => 
      item.vendor && item.vendor.user && item.vendor.user.toString() === req.user.id
    );

    if (req.user.role !== 'admin' && !isVendor) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    order.status = status;

    if (status === 'confirmed') {
      order.confirmedAt = new Date();
    } else if (status === 'shipped') {
      order.shippedAt = new Date();
      if (trackingNumber) order.trackingNumber = trackingNumber;
      if (carrier) order.carrier = carrier;
      if (estimatedDelivery) order.estimatedDelivery = estimatedDelivery;
    } else if (status === 'delivered') {
      order.deliveredAt = new Date();
    } else if (status === 'cancelled') {
      order.cancelledAt = new Date();
    }

    await order.save();

    const customer = await User.findById(order.customer).select('name email role');
    if (customer) {
      let customerEmailTemplate = 'order_status_update';
      if (status === 'delivered') customerEmailTemplate = 'order_delivered';
      if (status === 'cancelled') customerEmailTemplate = 'order_cancelled';

      await notifyUser({
        user: customer,
        type: 'ORDER',
        title: `Order status: ${status}`,
        message: `Order ${order.orderNumber} is now ${status}.`,
        linkUrl: `/orders/${order._id}/track`,
        metadata: { event: 'order.status-updated', orderId: order._id.toString(), status },
        emailTemplate: customerEmailTemplate,
        emailContext: {
          orderId: order.orderNumber,
          status,
          actionLinks: [{ label: 'Track order', url: buildAppUrl(`/orders/${order._id}/track`) }]
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order status updated',
      data: order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update tracking location
// @route   POST /api/orders/:orderId/tracking-location
// @access  Private (Vendor/Admin)
exports.updateTrackingLocation = async (req, res, next) => {
  try {
    const { latitude, longitude, address, description } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
    }

    const order = await Order.findById(req.params.orderId).populate('items.vendor');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check authorization
    const isVendor = order.items.some(item => 
      item.vendor && item.vendor.user && item.vendor.user.toString() === req.user.id
    );

    if (req.user.role !== 'admin' && !isVendor) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Add to tracking history
    order.trackingHistory.push({
      status: order.status,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude],
        address: address || ''
      },
      timestamp: new Date(),
      description: description || `Order is ${order.status}`
    });

    // Update current location
    order.currentLocation = {
      type: 'Point',
      coordinates: [longitude, latitude],
      address: address || '',
      updatedAt: new Date()
    };

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Tracking location updated',
      data: order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get orders for vendor
// @route   GET /api/orders/vendor/orders
// @access  Private (Vendor)
exports.getVendorOrders = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user.id });

    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    // Build query
    const query = { 'items.vendor': vendor._id };

    if (req.query.status) {
      query['items.status'] = req.query.status;
    }

    if (req.query.paymentStatus) {
      query.paymentStatus = req.query.paymentStatus;
    }

    const orders = await Order.find(query)
      .populate('customer', 'name email phone')
      .populate('items.product', 'name images')
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

// @desc    Get order details with tracking
// @route   GET /api/orders/:orderId/tracking
// @access  Private (Customer/Vendor/Admin)
exports.getOrderTracking = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate('customer', 'name email phone')
      .populate('items.vendor', 'storeName email phone address')
      .populate('items.product', 'name images');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check authorization
    const isVendor = order.items.some(item => 
      item.vendor && item.vendor.user && item.vendor.user.toString() === req.user.id
    );

    if (
      req.user.role !== 'admin' &&
      order.customer._id.toString() !== req.user.id &&
      !isVendor
    ) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const trackingData = {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentMethod: order.fulfillmentMethod,
      currentLocation: order.currentLocation,
      trackingHistory: order.trackingHistory,
      trackingNumber: order.trackingNumber,
      carrier: order.carrier,
      estimatedDelivery: order.estimatedDelivery,
      shippingAddress: order.shippingAddress,
      collectionPoint: order.collectionPoint,
      createdAt: order.createdAt,
      confirmedAt: order.confirmedAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt
    };

    res.status(200).json({
      success: true,
      data: trackingData
    });
  } catch (error) {
    next(error);
  }
};

