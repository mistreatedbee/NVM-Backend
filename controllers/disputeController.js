const mongoose = require('mongoose');
const Dispute = require('../models/Dispute');
const Order = require('../models/Order');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { uploadByType } = require('../utils/uploadAsset');
const { notifyUser, notifyAdmins } = require('../services/notificationService');
const { getIO } = require('../socket');

function isObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function normalizeStatus(status) {
  const value = String(status || '').toUpperCase();
  if (['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED'].includes(value)) return value;
  return null;
}

function sanitizeText(value, max = 3000) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeAttachments(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => ({
      url: String(item?.url || '').trim(),
      fileName: String(item?.fileName || '').trim(),
      mimeType: String(item?.mimeType || '').trim(),
      size: Number(item?.size || 0)
    }))
    .filter((item) => item.url)
    .slice(0, 5);
}

async function getVendorProfileByUser(userId) {
  return Vendor.findOne({ user: userId }).select('_id user storeName');
}

async function canAccessDispute(dispute, user) {
  if (!dispute || !user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'customer') return String(dispute.customer) === String(user.id);
  if (user.role === 'vendor') {
    const vendor = await getVendorProfileByUser(user.id);
    if (!vendor) return false;
    return String(dispute.vendor) === String(vendor._id);
  }
  return false;
}

async function appendMessage({ dispute, senderId = null, senderRole, message = '', attachments = [] }) {
  dispute.messages = dispute.messages || [];
  dispute.messages.push({
    sender: senderId,
    senderRole,
    message,
    attachments,
    createdAt: new Date()
  });
  await dispute.save();
  return dispute.messages[dispute.messages.length - 1];
}

async function notifyDisputeParticipants({ dispute, actor, title, message, linkUrl, metadata = {} }) {
  const [customer, vendor] = await Promise.all([
    User.findById(dispute.customer).select('name email role'),
    Vendor.findById(dispute.vendor).select('user storeName')
  ]);

  const vendorUser = vendor?.user ? await User.findById(vendor.user).select('name email role') : null;

  const recipients = [];
  if (customer && String(customer._id) !== String(actor?.id || '')) recipients.push(customer);
  if (vendorUser && String(vendorUser._id) !== String(actor?.id || '')) recipients.push(vendorUser);

  await Promise.all(
    recipients.map((recipient) =>
      notifyUser({
        user: recipient,
        type: 'ORDER',
        subType: 'DISPUTE_UPDATED',
        title,
        message,
        linkUrl,
        metadata
      })
    )
  );
}

function emitDisputeEvent(disputeId, eventName, payload = {}) {
  try {
    const io = getIO();
    io.to(`dispute:${String(disputeId)}`).emit(eventName, payload);
  } catch (_error) {
    // Socket server may not be initialized in some environments.
  }
}

function emitDisputeAdminFeed(payload = {}) {
  try {
    const io = getIO();
    io.to('role:admin').emit('dispute:admin-feed', payload);
  } catch (_error) {
    // Socket server may not be initialized in some environments.
  }
}

async function emitDisputeListUpdate(dispute, extra = {}) {
  try {
    const io = getIO();
    const vendor = await Vendor.findById(dispute.vendor).select('user');
    const userIds = [String(dispute.customer)];
    if (vendor?.user) userIds.push(String(vendor.user));
    userIds.forEach((userId) => {
      io.to(`user:${userId}`).emit('dispute:list-updated', {
        disputeId: String(dispute._id),
        status: dispute.status,
        ...extra
      });
    });
  } catch (_error) {
    // Socket server may not be initialized in some environments.
  }
}

exports.uploadDisputeAttachment = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File is required' });
    }

    const result = await uploadByType({
      file: req.file,
      type: 'doc',
      folder: process.env.DISPUTE_ATTACHMENT_UPLOAD_FOLDER || 'nvm/disputes/attachments',
      resourceType: 'auto'
    });
    if (!result) {
      return res.status(400).json({ success: false, message: 'Invalid file upload' });
    }

    return res.status(201).json({
      success: true,
      data: {
        url: result.originalUrl,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.createDispute = async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Only customers can open disputes' });
    }

    const { orderId, reason, description } = req.body || {};
    if (!isObjectId(orderId)) return res.status(400).json({ success: false, message: 'Invalid orderId' });

    const reasonText = sanitizeText(reason, 240);
    const descriptionText = sanitizeText(description, 5000);
    if (!reasonText || !descriptionText) {
      return res.status(400).json({ success: false, message: 'reason and description are required' });
    }

    const order = await Order.findOne({
      _id: orderId,
      $or: [{ customer: req.user.id }, { customerId: req.user.id }]
    }).select('_id orderNumber items');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const vendorId = String(req.body.vendorId || '') && isObjectId(req.body.vendorId)
      ? req.body.vendorId
      : String(order.items?.[0]?.vendorId || order.items?.[0]?.vendor || '');
    if (!vendorId || !isObjectId(vendorId)) return res.status(400).json({ success: false, message: 'Could not resolve vendor for this dispute' });

    const attachments = normalizeAttachments(req.body?.attachments || req.body?.evidence);

    const dispute = await Dispute.create({
      order: order._id,
      customer: req.user.id,
      vendor: vendorId,
      reason: reasonText,
      description: descriptionText,
      evidence: attachments,
      status: 'OPEN',
      messages: [
        {
          sender: req.user.id,
          senderRole: 'CUSTOMER',
          message: descriptionText,
          attachments,
          createdAt: new Date()
        }
      ]
    });

    const vendor = await Vendor.findById(vendorId).select('user');
    if (vendor?.user) {
      const vendorUser = await User.findById(vendor.user).select('name email role');
      if (vendorUser) {
        await notifyUser({
          user: vendorUser,
          type: 'ORDER',
          subType: 'DISPUTE_OPENED',
          title: 'Order dispute opened',
          message: `A customer opened a dispute for order ${order.orderNumber}.`,
          linkUrl: `/disputes?disputeId=${dispute._id}`,
          metadata: { event: 'dispute.opened', disputeId: String(dispute._id), orderId: String(order._id) }
        });
      }
    }

    await notifyAdmins({
      type: 'SYSTEM',
      subType: 'DISPUTE_OPENED',
      title: 'New dispute opened',
      message: `Order ${order.orderNumber} dispute requires review.`,
      linkUrl: `/admin/disputes/${dispute._id}`,
      metadata: { disputeId: String(dispute._id), orderId: String(order._id) }
    });

    await AuditLog.create({
      actorId: req.user.id,
      actorRole: 'Customer',
      action: 'DISPUTE_CREATED',
      entityType: 'Order',
      entityId: order._id,
      metadata: {
        disputeId: String(dispute._id),
        orderId: String(order._id),
        vendorId: String(vendorId)
      }
    });

    emitDisputeEvent(dispute._id, 'dispute:updated', {
      disputeId: String(dispute._id),
      status: dispute.status,
      reason: dispute.reason
    });
    emitDisputeAdminFeed({
      disputeId: String(dispute._id),
      status: dispute.status,
      event: 'created',
      orderNumber: order.orderNumber
    });
    await emitDisputeListUpdate(dispute, { event: 'created' });

    return res.status(201).json({ success: true, data: dispute });
  } catch (error) {
    return next(error);
  }
};

exports.getMyDisputes = async (req, res, next) => {
  try {
    const query = req.user.role === 'customer'
      ? { customer: req.user.id }
      : req.user.role === 'vendor'
        ? { vendor: (await Vendor.findOne({ user: req.user.id }).select('_id'))?._id || null }
        : {};

    if (req.user.role === 'vendor' && !query.vendor) {
      return res.status(200).json({ success: true, data: [] });
    }

    if (req.query.status) {
      const status = normalizeStatus(req.query.status);
      if (status) query.status = status;
    }

    const data = await Dispute.find(query)
      .populate('order', 'orderNumber status paymentStatus')
      .populate('customer', 'name email')
      .populate('vendor', 'storeName')
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

exports.getDisputeById = async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid dispute id' });

    const dispute = await Dispute.findById(req.params.id)
      .populate('order', 'orderNumber status paymentStatus')
      .populate('customer', 'name email')
      .populate('vendor', 'storeName user')
      .populate('resolvedBy', 'name email')
      .populate('messages.sender', 'name email role');

    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });

    const allowed = await canAccessDispute(dispute, req.user);
    if (!allowed) return res.status(403).json({ success: false, message: 'Not authorized' });

    return res.status(200).json({ success: true, data: dispute });
  } catch (error) {
    return next(error);
  }
};

exports.getDisputeMessages = async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid dispute id' });

    const dispute = await Dispute.findById(req.params.id).populate('messages.sender', 'name email role');
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });

    const allowed = await canAccessDispute(dispute, req.user);
    if (!allowed) return res.status(403).json({ success: false, message: 'Not authorized' });

    return res.status(200).json({ success: true, data: dispute.messages || [] });
  } catch (error) {
    return next(error);
  }
};

exports.postDisputeMessage = async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid dispute id' });

    const dispute = await Dispute.findById(req.params.id).populate('order', 'orderNumber');
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });

    const allowed = await canAccessDispute(dispute, req.user);
    if (!allowed) return res.status(403).json({ success: false, message: 'Not authorized' });

    const text = sanitizeText(req.body?.message, 5000);
    const attachments = normalizeAttachments(req.body?.attachments);
    if (!text && !attachments.length) {
      return res.status(400).json({ success: false, message: 'message or attachments are required' });
    }

    if (dispute.status === 'CLOSED' && req.user.role !== 'admin') {
      return res.status(400).json({ success: false, message: 'Dispute is closed' });
    }

    const senderRole = req.user.role === 'admin' ? 'ADMIN' : req.user.role === 'vendor' ? 'VENDOR' : 'CUSTOMER';
    const item = await appendMessage({
      dispute,
      senderId: req.user.id,
      senderRole,
      message: text,
      attachments
    });

    await AuditLog.create({
      actorId: req.user.id,
      actorRole: senderRole,
      action: 'DISPUTE_MESSAGE_SENT',
      entityType: 'Order',
      entityId: dispute.order?._id || null,
      metadata: {
        disputeId: String(dispute._id),
        messageId: String(item._id),
        attachments: attachments.length
      }
    });

    await notifyDisputeParticipants({
      dispute,
      actor: req.user,
      title: 'New dispute message',
      message: `New update on dispute for order ${dispute.order?.orderNumber || ''}.`,
      linkUrl: req.user.role === 'admin' ? `/disputes?disputeId=${dispute._id}` : `/admin/disputes/${dispute._id}`,
      metadata: {
        event: 'dispute.message.sent',
        disputeId: String(dispute._id)
      }
    });

    if (senderRole !== 'ADMIN') {
      await notifyAdmins({
        type: 'SYSTEM',
        subType: 'DISPUTE_MESSAGE',
        title: 'Dispute updated',
        message: `Dispute for order ${dispute.order?.orderNumber || ''} has a new message.`,
        linkUrl: `/admin/disputes/${dispute._id}`,
        metadata: { disputeId: String(dispute._id) }
      });
    }

    const populated = await Dispute.findById(dispute._id).populate('messages.sender', 'name email role');
    const latest = populated?.messages?.[populated.messages.length - 1] || item;

    emitDisputeEvent(dispute._id, 'dispute:new-message', {
      disputeId: String(dispute._id),
      message: latest
    });
    emitDisputeAdminFeed({
      disputeId: String(dispute._id),
      status: dispute.status,
      event: 'message',
      orderNumber: dispute.order?.orderNumber || ''
    });
    await emitDisputeListUpdate(dispute, { event: 'message' });

    return res.status(201).json({ success: true, data: latest });
  } catch (error) {
    return next(error);
  }
};

exports.getAdminDisputes = async (req, res, next) => {
  try {
    const query = {};
    if (req.query.status) {
      const status = normalizeStatus(req.query.status);
      if (status) query.status = status;
    }
    const data = await Dispute.find(query)
      .populate('order', 'orderNumber status paymentStatus')
      .populate('customer', 'name email')
      .populate('vendor', 'storeName')
      .populate('resolvedBy', 'name email')
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

exports.adminUpdateDispute = async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid dispute id' });
    const status = normalizeStatus(req.body?.status);
    if (!status) return res.status(400).json({ success: false, message: 'Invalid status' });

    const dispute = await Dispute.findById(req.params.id).populate('order', 'orderNumber');
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });

    dispute.status = status;
    if (status === 'RESOLVED' || status === 'CLOSED') {
      dispute.resolution = sanitizeText(req.body?.resolution, 5000);
      dispute.resolvedBy = req.user.id;
      dispute.resolvedAt = new Date();
      if (dispute.resolution) {
        await appendMessage({
          dispute,
          senderId: req.user.id,
          senderRole: 'ADMIN',
          message: `Resolution: ${dispute.resolution}`,
          attachments: []
        });
      }
    }
    await dispute.save();

    await AuditLog.create({
      actorId: req.user.id,
      actorRole: 'Admin',
      action: 'DISPUTE_UPDATED',
      entityType: 'Order',
      entityId: dispute.order?._id || null,
      metadata: {
        disputeId: String(dispute._id),
        status: dispute.status,
        resolution: dispute.resolution || ''
      }
    });

    const customer = await User.findById(dispute.customer).select('name email role');
    if (customer) {
      await notifyUser({
        user: customer,
        type: 'ORDER',
        subType: 'DISPUTE_UPDATED',
        title: 'Dispute status updated',
        message: `Your dispute for order ${dispute.order?.orderNumber || ''} is now ${dispute.status}.`,
        linkUrl: '/disputes',
        metadata: {
          event: 'dispute.updated',
          disputeId: String(dispute._id),
          status: dispute.status
        }
      });
    }

    emitDisputeEvent(dispute._id, 'dispute:updated', {
      disputeId: String(dispute._id),
      status: dispute.status,
      resolution: dispute.resolution || '',
      resolvedAt: dispute.resolvedAt || null
    });
    emitDisputeAdminFeed({
      disputeId: String(dispute._id),
      status: dispute.status,
      event: 'status',
      orderNumber: dispute.order?.orderNumber || ''
    });
    await emitDisputeListUpdate(dispute, { event: 'status' });

    return res.status(200).json({ success: true, data: dispute });
  } catch (error) {
    return next(error);
  }
};
