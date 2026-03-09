const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const SupportTicket = require('../models/ChatSupportTicket');
const Vendor = require('../models/Vendor');
const Order = require('../models/Order');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { botReply } = require('../utils/chatbot');
const { getIO } = require('../socket');
const { notifyAdmins } = require('../services/notificationService');
const { buildAppUrl } = require('../utils/appUrl');
const { uploadByType } = require('../utils/uploadAsset');

const URGENT_KEYWORDS = ['payment issue', 'fraud', 'dispute', 'chargeback', 'scam'];
const AUTO_ESCALATE_AFTER_ATTEMPTS = 3;
const ALLOWED_ATTACHMENT_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'video/mp4'
];
const HUMAN_SUPPORT_KEYWORDS = ['admin', 'human', 'agent', 'support', 'representative'];
const ORDER_CONTEXT_KEYWORDS = ['order', 'delivery', 'tracking', 'refund', 'return', 'payment', 'vendor'];

function sanitizeMessage(value) {
  if (!value) return '';
  return String(value)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSenderRoleFromUser(user) {
  if (user.role === 'admin') return 'Admin';
  if (user.role === 'vendor') return 'Vendor';
  return 'Customer';
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function containsUrgentKeyword(message) {
  const normalized = (message || '').toLowerCase();
  return URGENT_KEYWORDS.some(keyword => normalized.includes(keyword));
}

function wantsHumanSupport(message) {
  const normalized = (message || '').toLowerCase();
  return HUMAN_SUPPORT_KEYWORDS.some(keyword => normalized.includes(keyword));
}

function looksOrderRelated(message) {
  const normalized = (message || '').toLowerCase();
  return ORDER_CONTEXT_KEYWORDS.some(keyword => normalized.includes(keyword));
}

async function buildOrderSuggestionsForUser(user, max = 3) {
  if (!user) return [];

  if (user.role === 'customer') {
    const orders = await Order.find({ customer: user.id })
      .select('_id orderNumber status items createdAt')
      .populate('items.vendor', 'storeName')
      .sort({ createdAt: -1 })
      .limit(max);

    return orders.map(order => {
      const firstVendor = order.items?.[0]?.vendor;
      return {
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        vendorId: firstVendor?._id || null,
        vendorName: firstVendor?.storeName || null
      };
    });
  }

  if (user.role === 'vendor') {
    const vendorProfile = await ensureVendorProfile(user.id);
    if (!vendorProfile) return [];

    const orders = await Order.find({ 'items.vendor': vendorProfile._id })
      .select('_id orderNumber status customer createdAt')
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .limit(max);

    return orders.map(order => ({
      orderId: order._id,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      customerId: order.customer?._id || null,
      customerName: order.customer?.name || null,
      vendorId: vendorProfile._id,
      vendorName: vendorProfile.storeName || null
    }));
  }

  return [];
}

async function writeAuditLog({ actorId, actorRole, action, entityType, entityId, metadata = {} }) {
  await AuditLog.create({
    actorId: actorId || null,
    actorRole,
    action,
    entityType,
    entityId,
    metadata
  });
}

async function createAdminNotifications(title, message, data = {}) {
  await notifyAdmins({
    type: 'SYSTEM',
    subType: 'CHATBOT_ESCALATION',
    title,
    message,
    linkUrl: '/admin/chats',
    metadata: data,
    emailTemplate: 'chatbot_escalation_admin',
    emailContext: {
      orderId: data.orderId || null,
      actionLinks: [{ label: 'Open escalations', url: buildAppUrl('/admin/chats') }]
    }
  });
}

async function canAccessConversation(conversation, user) {
  if (!conversation || !user) return false;
  if (user.role === 'admin') return true;

  return conversation.participantIds.some(
    participantId => participantId.toString() === user.id
  );
}

async function ensureVendorProfile(userId) {
  const vendor = await Vendor.findOne({ user: userId }).select('_id user storeName');
  return vendor;
}

async function createMessageAndBroadcast({ conversation, senderId, senderRole, messageContent, messageType = 'text', attachment = null }) {
  const message = await Message.create({
    conversationId: conversation._id,
    senderId,
    senderRole,
    messageContent,
    messageType,
    attachment: attachment || undefined
  });

  conversation.lastMessage = messageContent || (messageType === 'system' ? 'System update' : 'Attachment');
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();

  let io;
  try {
    io = getIO();
  } catch (error) {
    io = null;
  }

  if (io) {
    io.to(`conversation:${conversation._id}`).emit('chat:new-message', {
      conversationId: conversation._id,
      message
    });

    conversation.participantIds.forEach(participantId => {
      io.to(`user:${participantId.toString()}`).emit('chat:conversation-updated', {
        conversationId: conversation._id,
        lastMessage: conversation.lastMessage,
        lastMessageAt: conversation.lastMessageAt
      });
    });
  }

  return message;
}

// POST /api/chat/attachments/upload
exports.uploadChatAttachment = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File is required' });
    }

    const result = await uploadByType({
      file: req.file,
      type: 'doc',
      folder: process.env.CHAT_ATTACHMENT_UPLOAD_FOLDER || 'nvm/chat/attachments',
      resourceType: 'auto'
    });
    if (!result) {
      return res.status(400).json({ success: false, message: 'Invalid file upload' });
    }

    return res.status(201).json({
      success: true,
      data: {
        url: result.originalUrl,
        public_id: result.publicId,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
      }
    });
  } catch (error) {
    return next(error);
  }
};

// POST /api/chat/conversations
exports.createConversation = async (req, res, next) => {
  try {
    const { type = 'general', vendorId, participantId, orderId, forceNew = false } = req.body;

    if (!['general', 'order', 'support'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid conversation type' });
    }

    let vendorProfile = null;
    let customerId = null;
    let vendorUserId = null;
    const actorRole = getSenderRoleFromUser(req.user);

    if (req.user.role === 'vendor') {
      vendorProfile = await ensureVendorProfile(req.user.id);
      vendorUserId = req.user.id;

      if (type !== 'support') {
        customerId = participantId;
        if (!participantId || !isValidObjectId(participantId)) {
          return res.status(400).json({ success: false, message: 'Valid participantId is required' });
        }
      }
    } else if (req.user.role === 'customer') {
      customerId = req.user.id;

      if (type !== 'support') {
        if (!vendorId || !isValidObjectId(vendorId)) {
          return res.status(400).json({ success: false, message: 'Valid vendorId is required' });
        }
        vendorProfile = await Vendor.findById(vendorId).select('_id user storeName');
        if (!vendorProfile || !vendorProfile.user) {
          return res.status(404).json({ success: false, message: 'Vendor not found' });
        }
        vendorUserId = vendorProfile.user.toString();
      } else if (vendorId && isValidObjectId(vendorId)) {
        vendorProfile = await Vendor.findById(vendorId).select('_id user storeName');
        vendorUserId = vendorProfile?.user?.toString() || null;
      }
    } else if (req.user.role === 'admin') {
      if (!participantId || !isValidObjectId(participantId) || !vendorId || !isValidObjectId(vendorId)) {
        return res.status(400).json({ success: false, message: 'participantId and vendorId are required for admin-created conversations' });
      }
      vendorProfile = await Vendor.findById(vendorId).select('_id user storeName');
      if (!vendorProfile || !vendorProfile.user) {
        return res.status(404).json({ success: false, message: 'Vendor not found' });
      }
      customerId = participantId;
      vendorUserId = vendorProfile.user.toString();
    }

    let order = null;
    if (type === 'order') {
      if (!orderId || !isValidObjectId(orderId)) {
        return res.status(400).json({ success: false, message: 'Valid orderId is required for order conversation' });
      }

      order = await Order.findById(orderId).select('_id customer items status orderNumber');
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      if (!vendorProfile && vendorId) {
        vendorProfile = await Vendor.findById(vendorId).select('_id user storeName');
      }

      if (order.customer.toString() !== customerId?.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Not authorized for this order conversation' });
      }

      if (vendorProfile && !order.items.some(item => item.vendor.toString() === vendorProfile._id.toString()) && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Vendor is not part of this order' });
      }
    }

    if (!vendorProfile && req.user.role === 'vendor') {
      vendorProfile = await ensureVendorProfile(req.user.id);
    }

    if (!vendorProfile && vendorId) {
      vendorProfile = await Vendor.findById(vendorId).select('_id user storeName');
    }

    if (type !== 'support' && !vendorProfile) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    }

    vendorUserId = vendorUserId || vendorProfile?.user?.toString();

    if (type !== 'support' && (!vendorUserId || !customerId)) {
      return res.status(400).json({ success: false, message: 'Unable to resolve participants' });
    }

    let conversation = null;
    if (!forceNew) {
      const query = type === 'support'
        ? {
          type,
          createdBy: req.user.id,
          ...(orderId ? { orderId } : { orderId: null })
        }
        : {
          type,
          vendorId: vendorProfile._id,
          customerId,
          vendorUserId,
          ...(type === 'order' ? { orderId } : { orderId: null })
        };

      conversation = await Conversation.findOne(query);
    }

    if (!conversation) {
      const participants = type === 'support'
        ? [req.user.id]
        : [customerId, vendorUserId];

      conversation = await Conversation.create({
        type,
        participantIds: participants,
        customerId: type === 'support' ? (req.user.role === 'customer' ? req.user.id : null) : customerId,
        vendorUserId: type === 'support' ? (req.user.role === 'vendor' ? req.user.id : vendorUserId || null) : vendorUserId,
        vendorId: vendorProfile?._id || null,
        orderId: orderId || null,
        orderStatusSnapshot: order?.status || null,
        createdBy: req.user.id,
        supportStatus: 'Open'
      });

      await writeAuditLog({
        actorId: req.user.id,
        actorRole,
        action: 'conversation.created',
        entityType: 'Conversation',
        entityId: conversation._id,
        metadata: { type, orderId: orderId || null }
      });

      if (type === 'order' && order) {
        await createMessageAndBroadcast({
          conversation,
          senderId: null,
          senderRole: 'System',
          messageContent: `Order ${order.orderNumber} conversation started. Current status: ${order.status}.`,
          messageType: 'system'
        });
      }
    }

    const populated = await Conversation.findById(conversation._id)
      .populate('customerId', 'name avatar role')
      .populate('vendorUserId', 'name avatar role')
      .populate('vendorId', 'storeName logo')
      .populate('orderId', 'orderNumber status');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// GET /api/chat/conversations
exports.getConversations = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const query = {};

    if (req.user.role !== 'admin') {
      query.participantIds = req.user.id;
    } else if (req.query.escalated === 'true') {
      query.isEscalated = true;
    }

    if (req.query.type) {
      query.type = req.query.type;
    }

    const conversations = await Conversation.find(query)
      .populate('customerId', 'name avatar role')
      .populate('vendorUserId', 'name avatar role')
      .populate('vendorId', 'storeName logo')
      .populate('orderId', 'orderNumber status')
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Conversation.countDocuments(query);

    res.status(200).json({
      success: true,
      total,
      currentPage: page,
      pages: Math.ceil(total / limit),
      data: conversations
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/chat/starters
exports.getChatStarters = async (req, res, next) => {
  try {
    const orderSuggestions = await buildOrderSuggestionsForUser(req.user, 6);

    const recentConversations = await Conversation.find(
      req.user.role === 'admin'
        ? {}
        : { participantIds: req.user.id }
    )
      .select('_id type vendorId customerId vendorUserId orderId lastMessageAt')
      .populate('vendorId', 'storeName')
      .populate('customerId', 'name')
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(10);

    res.status(200).json({
      success: true,
      data: {
        orderSuggestions,
        recentConversations
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/chat/conversations/:id
exports.getConversationById = async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.id)
      .populate('customerId', 'name avatar role')
      .populate('vendorUserId', 'name avatar role')
      .populate('vendorId', 'storeName logo')
      .populate('orderId', 'orderNumber status paymentStatus');

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const allowed = await canAccessConversation(conversation, req.user);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (conversation.orderId) {
      conversation.orderStatusSnapshot = conversation.orderId.status;
      await conversation.save();
    }

    res.status(200).json({ success: true, data: conversation });
  } catch (error) {
    next(error);
  }
};

// POST /api/chat/messages
exports.postMessage = async (req, res, next) => {
  try {
    const { conversationId, messageContent, messageType = 'text', attachment } = req.body;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ success: false, message: 'Valid conversationId is required' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const allowed = await canAccessConversation(conversation, req.user);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const cleanedMessage = sanitizeMessage(messageContent);

    if (!cleanedMessage && !attachment) {
      return res.status(400).json({ success: false, message: 'Message content or attachment is required' });
    }

    if (attachment?.mimeType && !ALLOWED_ATTACHMENT_MIME.includes(attachment.mimeType)) {
      return res.status(400).json({ success: false, message: 'Unsupported file type' });
    }

    const senderRole = getSenderRoleFromUser(req.user);

    const message = await createMessageAndBroadcast({
      conversation,
      senderId: req.user.id,
      senderRole,
      messageContent: cleanedMessage,
      messageType,
      attachment: attachment || null
    });

    if (containsUrgentKeyword(cleanedMessage)) {
      await createAdminNotifications(
        'Urgent chat keyword detected',
        `Urgent keyword found in conversation ${conversation._id}`,
        { conversationId: conversation._id, trigger: cleanedMessage }
      );
    }

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: senderRole,
      action: 'message.sent',
      entityType: 'Message',
      entityId: message._id,
      metadata: { conversationId: conversation._id, messageType }
    });

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
};

// GET /api/chat/messages?conversationId=...&before=...&limit=...
exports.getMessages = async (req, res, next) => {
  try {
    const { conversationId, before } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);

    if (!conversationId || !isValidObjectId(conversationId)) {
      return res.status(400).json({ success: false, message: 'Valid conversationId is required' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const allowed = await canAccessConversation(conversation, req.user);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const query = { conversationId };

    if (before) {
      const beforeDate = new Date(before);
      if (!Number.isNaN(beforeDate.getTime())) {
        query.createdAt = { $lt: beforeDate };
      }
    }

    const messagesDesc = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('senderId', 'name avatar role');

    const messages = messagesDesc.reverse();
    const nextCursor = messagesDesc.length === limit ? messagesDesc[messagesDesc.length - 1].createdAt.toISOString() : null;

    res.status(200).json({
      success: true,
      nextCursor,
      data: messages
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/chat/messages/:id/read
exports.markMessageAsRead = async (req, res, next) => {
  try {
    const message = await Message.findById(req.params.id).populate('conversationId');

    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const allowed = await canAccessConversation(message.conversationId, req.user);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (!message.readAt) {
      message.readAt = new Date();
      await message.save();

      let io;
      try {
        io = getIO();
      } catch (error) {
        io = null;
      }

      if (io) {
        io.to(`conversation:${message.conversationId._id}`).emit('chat:message-read', {
          conversationId: message.conversationId._id,
          messageId: message._id,
          readAt: message.readAt,
          readerId: req.user.id
        });
      }
    }

    res.status(200).json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
};

async function escalateConversation({ conversation, requestedBy, reason, unresolvedAttempts }) {
  conversation.isEscalated = true;
  conversation.escalatedAt = new Date();
  conversation.escalationReason = reason;
  conversation.supportStatus = 'Open';
  await conversation.save();

  let ticket = await SupportTicket.findOne({ conversationId: conversation._id });
  if (!ticket) {
    ticket = await SupportTicket.create({
      conversationId: conversation._id,
      vendorId: conversation.vendorId,
      vendorUserId: conversation.vendorUserId,
      customerId: conversation.customerId,
      orderId: conversation.orderId,
      escalationReason: reason,
      unresolvedAttempts
    });
  }

  await createMessageAndBroadcast({
    conversation,
    senderId: null,
    senderRole: 'System',
    messageContent: 'Conversation escalated to admin support. A support ticket is now open.',
    messageType: 'system'
  });

  await createAdminNotifications(
    'New escalated support chat',
    `Conversation ${conversation._id} requires admin assistance`,
    {
      conversationId: conversation._id,
      ticketId: ticket._id,
      reason,
      orderId: conversation.orderId || null,
      vendorId: conversation.vendorId
    }
  );

  await writeAuditLog({
    actorId: requestedBy?._id || null,
    actorRole: requestedBy ? getSenderRoleFromUser(requestedBy) : 'System',
    action: 'conversation.escalated',
    entityType: 'SupportTicket',
    entityId: ticket._id,
    metadata: { conversationId: conversation._id, reason }
  });

  return ticket;
}

// POST /api/chat/escalate
exports.escalateChat = async (req, res, next) => {
  try {
    const { conversationId, reason = 'Manual escalation requested by user' } = req.body;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ success: false, message: 'Valid conversationId is required' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const allowed = await canAccessConversation(conversation, req.user);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const ticket = await escalateConversation({
      conversation,
      requestedBy: req.user,
      reason: sanitizeMessage(reason) || 'Manual escalation requested by user',
      unresolvedAttempts: conversation.botContext?.unresolvedAttempts || 0
    });

    res.status(200).json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
};

// POST /api/chatbot/message
exports.chatbotMessage = async (req, res, next) => {
  try {
    if (!['customer', 'vendor'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only customers or vendors can use AI assistant chat' });
    }

    const { conversationId, message, orderId, vendorId } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    let conversation = null;
    if (conversationId && isValidObjectId(conversationId)) {
      conversation = await Conversation.findById(conversationId);
      if (conversation) {
        const allowed = await canAccessConversation(conversation, req.user);
        if (!allowed) {
          return res.status(403).json({ success: false, message: 'Not authorized for this conversation' });
        }
      }
    }

    if (!conversation) {
      let vendorProfile = null;
      if (req.user.role === 'vendor') {
        vendorProfile = await ensureVendorProfile(req.user.id);
      } else if (vendorId && isValidObjectId(vendorId)) {
        vendorProfile = await Vendor.findById(vendorId).select('_id user storeName');
      }

      conversation = await Conversation.create({
        type: 'support',
        participantIds: [req.user.id],
        customerId: req.user.role === 'customer' ? req.user.id : null,
        vendorUserId: req.user.role === 'vendor' ? req.user.id : vendorProfile?.user || null,
        vendorId: vendorProfile?._id || null,
        orderId: orderId && isValidObjectId(orderId) ? orderId : null,
        createdBy: req.user.id,
        supportStatus: 'Open'
      });
    }

    const cleanedIncoming = sanitizeMessage(message);
    const senderRole = getSenderRoleFromUser(req.user);

    const userMessage = await createMessageAndBroadcast({
      conversation,
      senderId: req.user.id,
      senderRole,
      messageContent: cleanedIncoming,
      messageType: 'text'
    });

    const assistant = botReply(cleanedIncoming);
    const orderSuggestions = await buildOrderSuggestionsForUser(req.user, 3);

    if (assistant.resolved) {
      conversation.botContext = {
        unresolvedAttempts: 0,
        lastIntent: assistant.intent,
        awaitingClarification: false
      };
    } else {
      const currentAttempts = (conversation.botContext?.unresolvedAttempts || 0) + 1;
      conversation.botContext = {
        unresolvedAttempts: currentAttempts,
        lastIntent: null,
        awaitingClarification: true
      };
    }

    await conversation.save();

    let enhancedResponse = assistant.response;

    if (looksOrderRelated(cleanedIncoming) && orderSuggestions.length) {
      const first = orderSuggestions[0];
      if (req.user.role === 'customer') {
        enhancedResponse += ` I found your recent order ${first.orderNumber} (${first.orderStatus}). Would you like to message ${first.vendorName || 'the vendor'} directly?`;
      } else {
        enhancedResponse += ` I found your recent order ${first.orderNumber} (${first.orderStatus}). Would you like to message the customer directly from order chat?`;
      }
    }

    const botMessage = await createMessageAndBroadcast({
      conversation,
      senderId: null,
      senderRole: 'Bot',
      messageContent: enhancedResponse,
      messageType: 'text'
    });

    let escalatedTicket = null;
    if (
      wantsHumanSupport(cleanedIncoming) ||
      (!assistant.resolved && conversation.botContext.unresolvedAttempts >= AUTO_ESCALATE_AFTER_ATTEMPTS)
    ) {
      escalatedTicket = await escalateConversation({
        conversation,
        requestedBy: req.user,
        reason: wantsHumanSupport(cleanedIncoming)
          ? 'User requested admin support'
          : 'Auto escalation: assistant could not resolve issue',
        unresolvedAttempts: conversation.botContext.unresolvedAttempts
      });
    }

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: senderRole,
      action: 'chatbot.interaction',
      entityType: 'Conversation',
      entityId: conversation._id,
      metadata: {
        messageId: userMessage._id,
        botMessageId: botMessage._id,
        resolved: assistant.resolved,
        attempts: conversation.botContext.unresolvedAttempts
      }
    });

    res.status(200).json({
      success: true,
      data: {
        conversation,
        userMessage,
        botMessage,
        suggestions: orderSuggestions,
        escalated: Boolean(escalatedTicket),
        ticket: escalatedTicket
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/chats
exports.getAdminEscalatedChats = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const status = req.query.status;
    const query = { $or: [{ isEscalated: true }, { type: 'support' }] };

    if (status && ['Open', 'In Progress', 'Resolved'].includes(status)) {
      query.supportStatus = status;
    }

    const conversations = await Conversation.find(query)
      .populate('customerId', 'name email role')
      .populate('vendorUserId', 'name email role')
      .populate('vendorId', 'storeName')
      .populate('orderId', 'orderNumber status')
      .sort({ updatedAt: -1 });

    res.status(200).json({ success: true, data: conversations });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/admin/chats/:id/status
exports.updateAdminChatStatus = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { status } = req.body;
    if (!['Open', 'In Progress', 'Resolved'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid support status' });
    }

    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    conversation.supportStatus = status;
    await conversation.save();

    const ticket = await SupportTicket.findOne({ conversationId: conversation._id });
    if (ticket) {
      ticket.status = status;
      if (status === 'Resolved') {
        ticket.resolvedAt = new Date();
        ticket.resolvedBy = req.user.id;
      }
      ticket.assignedAdminId = req.user.id;
      await ticket.save();
    }

    const statusMessage = await createMessageAndBroadcast({
      conversation,
      senderId: req.user.id,
      senderRole: 'Admin',
      messageContent: `Admin updated support status to ${status}.`,
      messageType: 'system'
    });

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: 'Admin',
      action: 'admin.status-updated',
      entityType: 'Conversation',
      entityId: conversation._id,
      metadata: { status, messageId: statusMessage._id }
    });

    res.status(200).json({ success: true, data: conversation });
  } catch (error) {
    next(error);
  }
};

// Compatibility wrappers for existing /api/chats calls
exports.getUserChats = exports.getConversations;
exports.getChatById = exports.getConversationById;

exports.createChat = async (req, res, next) => {
  try {
    const body = {
      type: req.body.orderId ? 'order' : 'general',
      vendorId: req.body.vendorId,
      participantId: req.body.participantId,
      orderId: req.body.orderId
    };

    req.body = body;
    return exports.createConversation(req, res, next);
  } catch (error) {
    next(error);
  }
};
