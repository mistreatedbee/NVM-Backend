const fs = require('fs');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const PaymentProof = require('../models/PaymentProof');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const AuditLog = require('../models/AuditLog');
const cloudinary = require('../utils/cloudinary');
const { notifyUser, notifyAdmins } = require('../services/notificationService');

function isObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function isOwner(order, userId) {
  return String(order.customerId || order.customer) === String(userId);
}

function normalizeQueryStatus(status) {
  const value = String(status || '').toUpperCase();
  if (['UNDER_REVIEW', 'APPROVED', 'REJECTED'].includes(value)) return value;
  return null;
}

// POST /api/orders/:orderId/payment-proof
exports.uploadPaymentProof = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!isObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!isOwner(order, req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (String(order.paymentMethod || '').toUpperCase() !== 'INVOICE') {
      return res.status(400).json({ success: false, message: 'Payment proof is only supported for Invoice payment orders' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'paymentProof file is required' });
    }

    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowed.includes(req.file.mimetype)) {
      return res.status(400).json({ success: false, message: 'Only PDF, JPG, and PNG files are allowed' });
    }

    const upload = await cloudinary.uploader.upload(req.file.path, {
      folder: 'nvm-payment-proofs',
      resource_type: 'auto'
    });
    try { fs.unlinkSync(req.file.path); } catch (_error) {}

    await PaymentProof.updateMany(
      { orderId: order._id, customerId: req.user.id, status: 'UNDER_REVIEW' },
      { $set: { status: 'REJECTED', reviewedAt: new Date(), reviewNote: 'Superseded by newer upload' } }
    );

    const proof = await PaymentProof.create({
      orderId: order._id,
      customerId: req.user.id,
      fileUrl: upload.secure_url,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      status: 'UNDER_REVIEW',
      uploadedAt: new Date()
    });

    order.paymentStatus = 'UNDER_REVIEW';
    await order.save();

    await notifyAdmins({
      type: 'SYSTEM',
      subType: 'PAYMENT_PROOF_UNDER_REVIEW',
      title: 'New payment proof uploaded',
      message: `Order ${order.orderNumber} has a new proof of payment under review.`,
      linkUrl: '/admin/payments',
      metadata: {
        event: 'payment.proof.uploaded',
        orderId: String(order._id),
        proofId: String(proof._id)
      }
    });

    await notifyUser({
      user: req.user,
      type: 'ORDER',
      subType: 'PAYMENT_PROOF_UNDER_REVIEW',
      title: 'Proof of payment submitted',
      message: `Your payment proof for order ${order.orderNumber} is under review.`,
      linkUrl: `/orders/${order._id}/track`,
      metadata: {
        event: 'payment.proof.customer-under-review',
        orderId: String(order._id),
        proofId: String(proof._id)
      }
    });

    return res.status(201).json({ success: true, data: proof });
  } catch (error) {
    return next(error);
  }
};

// GET /api/orders/my/:orderId/payment-proof
exports.getMyPaymentProof = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!isObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }
    const order = await Order.findById(orderId).select('_id customer customerId paymentStatus paymentMethod paymentRejectionReason');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!isOwner(order, req.user.id)) return res.status(403).json({ success: false, message: 'Not authorized' });

    const proof = await PaymentProof.findOne({ orderId: order._id, customerId: req.user.id }).sort({ uploadedAt: -1, createdAt: -1 });
    return res.status(200).json({
      success: true,
      data: {
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        proof,
        rejectionReason: proof?.status === 'REJECTED' ? (proof.reviewNote || order.paymentRejectionReason || '') : ''
      }
    });
  } catch (error) {
    return next(error);
  }
};

// GET /api/admin/payment-proofs
exports.getAdminPaymentProofs = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const query = {};
    const normalizedStatus = normalizeQueryStatus(req.query.status);
    if (normalizedStatus) query.status = normalizedStatus;

    const q = String(req.query.q || '').trim();
    if (q) {
      const qConditions = [{ orderNumber: { $regex: q, $options: 'i' } }];
      if (isObjectId(q)) qConditions.push({ _id: q });
      const matchingOrders = await Order.find({
        $or: qConditions
      }).select('_id');
      query.orderId = { $in: matchingOrders.map((order) => order._id) };
    }

    const [data, total] = await Promise.all([
      PaymentProof.find(query)
        .populate('orderId', 'orderNumber paymentStatus total customerId customer')
        .populate('customerId', 'name email')
        .populate('reviewedBy', 'name email')
        .sort({ uploadedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PaymentProof.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data
    });
  } catch (error) {
    return next(error);
  }
};

// PATCH /api/admin/payment-proofs/:proofId/approve
exports.approvePaymentProof = async (req, res, next) => {
  try {
    const { proofId } = req.params;
    if (!isObjectId(proofId)) {
      return res.status(400).json({ success: false, message: 'Invalid proof id' });
    }
    const proof = await PaymentProof.findById(proofId).populate('orderId');
    if (!proof || !proof.orderId) return res.status(404).json({ success: false, message: 'Payment proof not found' });

    proof.status = 'APPROVED';
    proof.reviewedBy = req.user.id;
    proof.reviewedAt = new Date();
    proof.reviewNote = '';
    await proof.save();

    const order = await Order.findById(proof.orderId._id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    order.paymentStatus = 'PAID';
    order.paidAt = new Date();
    order.paymentConfirmedBy = req.user.id;
    order.paymentConfirmedAt = new Date();
    if (String(order.orderStatus || '').toUpperCase() === 'PENDING') {
      order.orderStatus = 'PROCESSING';
      order.status = 'processing';
      order.confirmedAt = new Date();
    }
    await order.save();

    await AuditLog.create({
      actorId: req.user.id,
      actorRole: 'Admin',
      action: 'PAYMENT_PROOF_APPROVED',
      entityType: 'Order',
      entityId: order._id,
      metadata: {
        proofId: String(proof._id),
        orderId: String(order._id),
        orderNumber: order.orderNumber
      }
    });

    const customer = await User.findById(order.customerId || order.customer).select('name email role');
    if (customer) {
      await notifyUser({
        user: customer,
        type: 'ORDER',
        subType: 'PAYMENT_APPROVED',
        title: 'Payment approved',
        message: `Your payment proof for order ${order.orderNumber} has been approved.`,
        linkUrl: `/orders/${order._id}/track`,
        metadata: { event: 'payment.proof.approved', orderId: String(order._id), proofId: String(proof._id) }
      });
    }

    const vendorIds = [...new Set((order.items || []).map((item) => String(item.vendorId || item.vendor)).filter(Boolean))];
    for (const vendorId of vendorIds) {
      const vendor = await Vendor.findById(vendorId).select('user');
      if (!vendor?.user) continue;
      const vendorUser = await User.findById(vendor.user).select('name email role');
      if (!vendorUser) continue;
      await notifyUser({
        user: vendorUser,
        type: 'ORDER',
        subType: 'ORDER_PAID',
        title: 'Order paid and ready to fulfil',
        message: `Order ${order.orderNumber} payment is confirmed and ready for fulfilment.`,
        linkUrl: `/vendor/orders/${order._id}`,
        metadata: { event: 'order.paid.ready-to-fulfil', orderId: String(order._id), proofId: String(proof._id) }
      });
    }

    return res.status(200).json({ success: true, data: proof });
  } catch (error) {
    return next(error);
  }
};

// PATCH /api/admin/payment-proofs/:proofId/reject
exports.rejectPaymentProof = async (req, res, next) => {
  try {
    const { proofId } = req.params;
    const note = String(req.body?.note || '').trim();
    if (!note) return res.status(400).json({ success: false, message: 'note is required' });
    if (!isObjectId(proofId)) {
      return res.status(400).json({ success: false, message: 'Invalid proof id' });
    }
    const proof = await PaymentProof.findById(proofId).populate('orderId');
    if (!proof || !proof.orderId) return res.status(404).json({ success: false, message: 'Payment proof not found' });

    proof.status = 'REJECTED';
    proof.reviewedBy = req.user.id;
    proof.reviewedAt = new Date();
    proof.reviewNote = note;
    await proof.save();

    const order = await Order.findById(proof.orderId._id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    order.paymentStatus = 'REJECTED';
    order.paymentRejectionReason = note;
    await order.save();

    await AuditLog.create({
      actorId: req.user.id,
      actorRole: 'Admin',
      action: 'PAYMENT_PROOF_REJECTED',
      entityType: 'Order',
      entityId: order._id,
      metadata: {
        proofId: String(proof._id),
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        note
      }
    });

    const customer = await User.findById(order.customerId || order.customer).select('name email role');
    if (customer) {
      await notifyUser({
        user: customer,
        type: 'ORDER',
        subType: 'PAYMENT_REJECTED',
        title: 'Payment proof rejected',
        message: `Your payment proof for order ${order.orderNumber} was rejected. Reason: ${note}`,
        linkUrl: `/orders/${order._id}/track`,
        metadata: { event: 'payment.proof.rejected', orderId: String(order._id), proofId: String(proof._id), note }
      });
    }

    return res.status(200).json({ success: true, data: proof });
  } catch (error) {
    return next(error);
  }
};
