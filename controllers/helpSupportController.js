const FAQ = require('../models/FAQ');
const OnboardingGuide = require('../models/OnboardingGuide');
const VendorOnboardingProgress = require('../models/VendorOnboardingProgress');
const VideoTutorial = require('../models/VideoTutorial');
const SupportTicket = require('../models/SupportTicket');
const SupportMessage = require('../models/SupportMessage');
const Counter = require('../models/Counter');
const Vendor = require('../models/Vendor');
const AuditLog = require('../models/AuditLog');
const cloudinary = require('../utils/cloudinary');
const { createNotification, notifyAdmins, safeSendTemplateEmail } = require('../services/notificationService');

const HELP_CATEGORIES = ['GENERAL', 'ORDERS', 'PAYMENTS', 'VENDORS', 'PRODUCTS', 'ACCOUNT', 'SECURITY', 'OTHER'];
const HELP_AUDIENCE = ['ALL', 'VENDOR', 'CUSTOMER'];
const GUIDE_AUDIENCE = ['VENDOR', 'ALL'];
const HELP_STATUS = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
const TICKET_CATEGORIES = ['TECHNICAL', 'ACCOUNT', 'ORDERS', 'PAYMENTS', 'VENDOR', 'OTHER'];
const TICKET_STATUS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const TICKET_PRIORITY = ['LOW', 'MEDIUM', 'HIGH'];

function sanitizeText(input) {
  if (typeof input !== 'string') return '';
  return input.trim();
}

function sanitizeRichText(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

function slugify(input) {
  const base = String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

  return base || `item-${Date.now()}`;
}

async function ensureUniqueSlug(model, raw, excludeId) {
  const root = slugify(raw);
  let attempt = 0;

  while (true) {
    const candidate = attempt === 0 ? root : `${root}-${attempt}`;
    const existing = await model.findOne({ slug: candidate }).select('_id');
    if (!existing || String(existing._id) === String(excludeId || '')) {
      return candidate;
    }
    attempt += 1;
  }
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 12));
  return { page, limit, skip: (page - 1) * limit };
}

function roleToAudienceFilter(user) {
  if (!user) return ['ALL'];
  if (user.role === 'vendor') return ['ALL', 'VENDOR'];
  if (user.role === 'customer') return ['ALL', 'CUSTOMER'];
  return ['ALL', 'VENDOR', 'CUSTOMER'];
}

function roleToTicketRole(user) {
  if (!user) return 'GUEST';
  if (user.role === 'vendor') return 'VENDOR';
  return 'CUSTOMER';
}

function normalizeTicketAttachments(input) {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => ({
      url: sanitizeText(item?.url),
      fileName: sanitizeText(item?.fileName),
      mimeType: sanitizeText(item?.mimeType),
      size: Number(item?.size || 0)
    }))
    .filter((item) => item.url)
    .slice(0, 5);
}

function getRequestIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || '';
}

async function logAdminAction(req, action, metadata = {}) {
  if (!req.user?.id) return;

  await AuditLog.create({
    actorId: req.user.id,
    actorRole: 'Admin',
    action,
    entityType: 'System',
    metadata: {
      ...metadata,
      ipAddress: getRequestIp(req),
      userAgent: req.headers['user-agent'] || ''
    }
  });
}

async function generateSupportTicketNumber() {
  const next = await Counter.findOneAndUpdate(
    { name: 'support_ticket_seq' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const year = new Date().getFullYear();
  return `SUP-${year}-${String(next.seq || 1).padStart(6, '0')}`;
}

async function fetchSupportThread(ticketId) {
  return SupportMessage.find({ ticketId }).sort({ createdAt: 1 });
}

exports.getFaqs = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {
      status: 'PUBLISHED',
      audience: { $in: roleToAudienceFilter(req.user) }
    };

    if (req.query.category && HELP_CATEGORIES.includes(req.query.category)) {
      query.category = req.query.category;
    }

    if (req.query.audience && HELP_AUDIENCE.includes(req.query.audience)) {
      if (query.audience.$in.includes(req.query.audience)) {
        query.audience = req.query.audience;
      }
    }

    if (req.query.q && String(req.query.q).trim()) {
      query.$text = { $search: String(req.query.q).trim() };
    }

    const sort = req.query.q
      ? { score: { $meta: 'textScore' }, featured: -1, publishedAt: -1, createdAt: -1 }
      : { featured: -1, publishedAt: -1, createdAt: -1 };

    const [items, total] = await Promise.all([
      FAQ.find(query)
        .select(req.query.q ? { score: { $meta: 'textScore' } } : {})
        .sort(sort)
        .skip(skip)
        .limit(limit),
      FAQ.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: items,
      total,
      count: items.length,
      currentPage: page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    return next(error);
  }
};

exports.getGuides = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {
      status: 'PUBLISHED',
      audience: { $in: roleToAudienceFilter(req.user) }
    };

    if (req.query.audience && GUIDE_AUDIENCE.includes(req.query.audience)) {
      if (query.audience.$in.includes(req.query.audience)) {
        query.audience = req.query.audience;
      }
    }

    if (req.query.q && String(req.query.q).trim()) {
      query.$text = { $search: String(req.query.q).trim() };
    }

    const sort = req.query.q
      ? { score: { $meta: 'textScore' }, order: 1, publishedAt: -1 }
      : { order: 1, publishedAt: -1 };

    const [items, total] = await Promise.all([
      OnboardingGuide.find(query)
        .select(req.query.q ? { score: { $meta: 'textScore' } } : {})
        .sort(sort)
        .skip(skip)
        .limit(limit),
      OnboardingGuide.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: items,
      total,
      count: items.length,
      currentPage: page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    return next(error);
  }
};

exports.getGuideBySlug = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const guide = await OnboardingGuide.findOne({
      slug,
      status: 'PUBLISHED',
      audience: { $in: roleToAudienceFilter(req.user) }
    });

    if (!guide) {
      return res.status(404).json({ success: false, message: 'Guide not found' });
    }

    return res.status(200).json({ success: true, data: guide });
  } catch (error) {
    return next(error);
  }
};

exports.getVideos = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {
      status: 'PUBLISHED',
      audience: { $in: roleToAudienceFilter(req.user) }
    };

    if (req.query.category && HELP_CATEGORIES.includes(req.query.category)) {
      query.category = req.query.category;
    }

    if (req.query.audience && HELP_AUDIENCE.includes(req.query.audience)) {
      if (query.audience.$in.includes(req.query.audience)) {
        query.audience = req.query.audience;
      }
    }

    if (req.query.q && String(req.query.q).trim()) {
      query.$text = { $search: String(req.query.q).trim() };
    }

    const sort = req.query.q
      ? { score: { $meta: 'textScore' }, publishedAt: -1, createdAt: -1 }
      : { publishedAt: -1, createdAt: -1 };

    const [items, total] = await Promise.all([
      VideoTutorial.find(query)
        .select(req.query.q ? { score: { $meta: 'textScore' } } : {})
        .sort(sort)
        .skip(skip)
        .limit(limit),
      VideoTutorial.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: items,
      total,
      count: items.length,
      currentPage: page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    return next(error);
  }
};

exports.getVideoBySlug = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const video = await VideoTutorial.findOne({
      slug,
      status: 'PUBLISHED',
      audience: { $in: roleToAudienceFilter(req.user) }
    });

    if (!video) {
      return res.status(404).json({ success: false, message: 'Video tutorial not found' });
    }

    return res.status(200).json({ success: true, data: video });
  } catch (error) {
    return next(error);
  }
};

exports.uploadSupportAttachment = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File is required' });
    }

    const folder = process.env.SUPPORT_ATTACHMENT_UPLOAD_FOLDER || 'nvm/support/attachments';

    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          use_filename: true,
          unique_filename: true
        },
        (error, uploaded) => {
          if (error) return reject(error);
          return resolve(uploaded);
        }
      );

      uploadStream.end(req.file.buffer);
    });

    return res.status(201).json({
      success: true,
      data: {
        url: result.secure_url,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.createSupportTicket = async (req, res, next) => {
  try {
    const name = sanitizeText(req.body.name);
    const email = sanitizeText(req.body.email).toLowerCase();
    const subject = sanitizeText(req.body.subject);
    const message = sanitizeRichText(req.body.message);

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: 'name, email, subject and message are required' });
    }

    const category = TICKET_CATEGORIES.includes(req.body.category) ? req.body.category : 'OTHER';
    const ticketNumber = await generateSupportTicketNumber();

    const ticket = await SupportTicket.create({
      ticketNumber,
      userId: req.user?.id || undefined,
      role: roleToTicketRole(req.user),
      name,
      email,
      phone: sanitizeText(req.body.phone),
      subject,
      message,
      category,
      status: 'OPEN',
      priority: 'MEDIUM',
      attachments: normalizeTicketAttachments(req.body.attachments)
    });

    await SupportMessage.create({
      ticketId: ticket._id,
      senderRole: 'USER',
      senderId: req.user?.id || undefined,
      message,
      attachments: ticket.attachments || []
    });

    if (req.user?.id) {
      await createNotification({
        userId: req.user.id,
        role: req.user.role,
        type: 'SYSTEM',
        subType: 'SUPPORT_TICKET_CREATED',
        title: 'Support ticket created',
        message: `Ticket ${ticket.ticketNumber} is now open.`,
        linkUrl: '/support/my',
        metadata: { ticketNumber: ticket.ticketNumber }
      });
    }

    await notifyAdmins({
      type: 'SYSTEM',
      subType: 'SUPPORT_TICKET_CREATED',
      title: 'New support ticket',
      message: `${ticket.ticketNumber}: ${ticket.subject}`,
      linkUrl: '/admin/support',
      metadata: {
        ticketNumber: ticket.ticketNumber,
        category: ticket.category,
        role: ticket.role
      }
    });

    await safeSendTemplateEmail({
      to: ticket.email,
      templateId: 'support_ticket_created',
      context: {
        userName: ticket.name,
        ticketId: ticket.ticketNumber,
        actionUrl: `${process.env.FRONTEND_URL || ''}/support/my`,
        appUrl: process.env.FRONTEND_URL || ''
      },
      metadata: { ticketNumber: ticket.ticketNumber }
    });

    return res.status(201).json({
      success: true,
      message: 'Support ticket submitted successfully',
      data: {
        ticketNumber: ticket.ticketNumber
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.getMySupportTickets = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = { userId: req.user.id };

    const [items, total] = await Promise.all([
      SupportTicket.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      SupportTicket.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: items,
      total,
      count: items.length,
      currentPage: page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    return next(error);
  }
};

exports.getMySupportTicketByNumber = async (req, res, next) => {
  try {
    const ticket = await SupportTicket.findOne({
      ticketNumber: String(req.params.ticketNumber || '').trim().toUpperCase(),
      userId: req.user.id
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const messages = await fetchSupportThread(ticket._id);

    return res.status(200).json({
      success: true,
      data: {
        ticket,
        messages
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.createMyTicketMessage = async (req, res, next) => {
  try {
    const ticket = await SupportTicket.findOne({
      ticketNumber: String(req.params.ticketNumber || '').trim().toUpperCase(),
      userId: req.user.id
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const message = sanitizeRichText(req.body.message);
    if (!message) {
      return res.status(400).json({ success: false, message: 'message is required' });
    }

    const item = await SupportMessage.create({
      ticketId: ticket._id,
      senderRole: 'USER',
      senderId: req.user.id,
      message,
      attachments: normalizeTicketAttachments(req.body.attachments)
    });

    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      ticket.status = 'IN_PROGRESS';
      await ticket.save();
    }

    await notifyAdmins({
      type: 'SYSTEM',
      subType: 'SUPPORT_TICKET_USER_REPLY',
      title: 'Support ticket reply',
      message: `${ticket.ticketNumber} has a new user reply.`,
      linkUrl: '/admin/support',
      metadata: { ticketNumber: ticket.ticketNumber }
    });

    return res.status(201).json({ success: true, data: item });
  } catch (error) {
    return next(error);
  }
};

exports.listAdminSupportTickets = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};

    if (req.query.status && TICKET_STATUS.includes(req.query.status)) query.status = req.query.status;
    if (req.query.category && TICKET_CATEGORIES.includes(req.query.category)) query.category = req.query.category;
    if (req.query.priority && TICKET_PRIORITY.includes(req.query.priority)) query.priority = req.query.priority;

    if (req.query.q && String(req.query.q).trim()) {
      const term = String(req.query.q).trim();
      query.$or = [
        { ticketNumber: { $regex: term, $options: 'i' } },
        { name: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
        { subject: { $regex: term, $options: 'i' } },
        { message: { $regex: term, $options: 'i' } }
      ];
    }

    const [items, total] = await Promise.all([
      SupportTicket.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      SupportTicket.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: items,
      total,
      count: items.length,
      currentPage: page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    return next(error);
  }
};

exports.getAdminSupportTicketByNumber = async (req, res, next) => {
  try {
    const ticket = await SupportTicket.findOne({
      ticketNumber: String(req.params.ticketNumber || '').trim().toUpperCase()
    }).populate('userId', 'name email role');

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const messages = await fetchSupportThread(ticket._id);

    return res.status(200).json({
      success: true,
      data: {
        ticket,
        messages
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateAdminSupportStatus = async (req, res, next) => {
  try {
    const status = req.body?.status;
    if (!TICKET_STATUS.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const ticket = await SupportTicket.findOne({
      ticketNumber: String(req.params.ticketNumber || '').trim().toUpperCase()
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    ticket.status = status;
    await ticket.save();

    if (ticket.userId) {
      await createNotification({
        userId: ticket.userId,
        role: ticket.role === 'VENDOR' ? 'vendor' : 'customer',
        type: 'SYSTEM',
        subType: 'SUPPORT_TICKET_STATUS',
        title: 'Support ticket updated',
        message: `Ticket ${ticket.ticketNumber} status changed to ${status}.`,
        linkUrl: '/support/my',
        metadata: { ticketNumber: ticket.ticketNumber, status }
      });
    }

    await logAdminAction(req, 'support.ticket.status.updated', {
      ticketNumber: ticket.ticketNumber,
      status
    });

    return res.status(200).json({ success: true, data: ticket });
  } catch (error) {
    return next(error);
  }
};

exports.updateAdminSupportPriority = async (req, res, next) => {
  try {
    const priority = req.body?.priority;
    if (!TICKET_PRIORITY.includes(priority)) {
      return res.status(400).json({ success: false, message: 'Invalid priority' });
    }

    const ticket = await SupportTicket.findOne({
      ticketNumber: String(req.params.ticketNumber || '').trim().toUpperCase()
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    ticket.priority = priority;
    await ticket.save();

    await logAdminAction(req, 'support.ticket.priority.updated', {
      ticketNumber: ticket.ticketNumber,
      priority
    });

    return res.status(200).json({ success: true, data: ticket });
  } catch (error) {
    return next(error);
  }
};

exports.replyAdminSupportTicket = async (req, res, next) => {
  try {
    const ticket = await SupportTicket.findOne({
      ticketNumber: String(req.params.ticketNumber || '').trim().toUpperCase()
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const message = sanitizeRichText(req.body.message);
    if (!message) {
      return res.status(400).json({ success: false, message: 'message is required' });
    }

    const item = await SupportMessage.create({
      ticketId: ticket._id,
      senderRole: 'ADMIN',
      senderId: req.user.id,
      message,
      attachments: normalizeTicketAttachments(req.body.attachments)
    });

    if (ticket.status === 'OPEN') {
      ticket.status = 'IN_PROGRESS';
      await ticket.save();
    }

    if (ticket.userId) {
      await createNotification({
        userId: ticket.userId,
        role: ticket.role === 'VENDOR' ? 'vendor' : 'customer',
        type: 'SYSTEM',
        subType: 'SUPPORT_TICKET_REPLY',
        title: 'New support reply',
        message: `Ticket ${ticket.ticketNumber} has a new admin response.`,
        linkUrl: '/support/my',
        metadata: { ticketNumber: ticket.ticketNumber }
      });
    }

    await safeSendTemplateEmail({
      to: ticket.email,
      templateId: 'support_ticket_updated',
      context: {
        userName: ticket.name,
        ticketId: ticket.ticketNumber,
        actionUrl: `${process.env.FRONTEND_URL || ''}/support/my`,
        appUrl: process.env.FRONTEND_URL || ''
      },
      metadata: { ticketNumber: ticket.ticketNumber }
    });

    await logAdminAction(req, 'support.ticket.reply.created', {
      ticketNumber: ticket.ticketNumber,
      messageId: item._id
    });

    return res.status(201).json({ success: true, data: item });
  } catch (error) {
    return next(error);
  }
};

exports.listAdminFaqs = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};

    if (req.query.status && HELP_STATUS.includes(req.query.status)) query.status = req.query.status;
    if (req.query.category && HELP_CATEGORIES.includes(req.query.category)) query.category = req.query.category;
    if (req.query.audience && HELP_AUDIENCE.includes(req.query.audience)) query.audience = req.query.audience;
    if (req.query.q && String(req.query.q).trim()) query.$text = { $search: String(req.query.q).trim() };

    const sort = req.query.q ? { score: { $meta: 'textScore' }, updatedAt: -1 } : { updatedAt: -1 };
    const [items, total] = await Promise.all([
      FAQ.find(query).select(req.query.q ? { score: { $meta: 'textScore' } } : {}).sort(sort).skip(skip).limit(limit),
      FAQ.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: items,
      total,
      count: items.length,
      currentPage: page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    return next(error);
  }
};

exports.createFaq = async (req, res, next) => {
  try {
    const question = sanitizeText(req.body.question);
    const answer = sanitizeRichText(req.body.answer);
    if (!question || !answer) return res.status(400).json({ success: false, message: 'question and answer are required' });

    const status = HELP_STATUS.includes(req.body.status) ? req.body.status : 'DRAFT';
    const faq = await FAQ.create({
      question,
      answer,
      category: HELP_CATEGORIES.includes(req.body.category) ? req.body.category : 'GENERAL',
      audience: HELP_AUDIENCE.includes(req.body.audience) ? req.body.audience : 'ALL',
      status,
      featured: Boolean(req.body.featured),
      createdBy: req.user.id,
      updatedBy: req.user.id,
      publishedAt: status === 'PUBLISHED' ? new Date() : undefined
    });

    return res.status(201).json({ success: true, data: faq });
  } catch (error) {
    return next(error);
  }
};

exports.updateFaq = async (req, res, next) => {
  try {
    const faq = await FAQ.findById(req.params.id);
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });

    if (req.body.question !== undefined) faq.question = sanitizeText(req.body.question);
    if (req.body.answer !== undefined) faq.answer = sanitizeRichText(req.body.answer);
    if (req.body.category && HELP_CATEGORIES.includes(req.body.category)) faq.category = req.body.category;
    if (req.body.audience && HELP_AUDIENCE.includes(req.body.audience)) faq.audience = req.body.audience;
    if (req.body.status && HELP_STATUS.includes(req.body.status)) faq.status = req.body.status;
    if (req.body.featured !== undefined) faq.featured = Boolean(req.body.featured);

    faq.updatedBy = req.user.id;
    faq.publishedAt = faq.status === 'PUBLISHED' ? (faq.publishedAt || new Date()) : undefined;

    await faq.save();
    return res.status(200).json({ success: true, data: faq });
  } catch (error) {
    return next(error);
  }
};

exports.publishFaq = async (req, res, next) => {
  try {
    const faq = await FAQ.findById(req.params.id);
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });

    faq.status = 'PUBLISHED';
    faq.publishedAt = new Date();
    faq.updatedBy = req.user.id;
    await faq.save();

    await logAdminAction(req, 'help.faq.published', { faqId: faq._id });
    return res.status(200).json({ success: true, data: faq });
  } catch (error) {
    return next(error);
  }
};

exports.unpublishFaq = async (req, res, next) => {
  try {
    const faq = await FAQ.findById(req.params.id);
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });

    faq.status = req.body?.status === 'ARCHIVED' ? 'ARCHIVED' : 'DRAFT';
    faq.publishedAt = undefined;
    faq.updatedBy = req.user.id;
    await faq.save();

    await logAdminAction(req, 'help.faq.unpublished', { faqId: faq._id, status: faq.status });
    return res.status(200).json({ success: true, data: faq });
  } catch (error) {
    return next(error);
  }
};

exports.deleteFaq = async (req, res, next) => {
  try {
    const faq = await FAQ.findById(req.params.id);
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });

    faq.status = 'ARCHIVED';
    faq.publishedAt = undefined;
    faq.updatedBy = req.user.id;
    await faq.save();

    return res.status(200).json({ success: true, message: 'FAQ archived', data: faq });
  } catch (error) {
    return next(error);
  }
};

exports.listAdminGuides = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};

    if (req.query.status && HELP_STATUS.includes(req.query.status)) query.status = req.query.status;
    if (req.query.audience && GUIDE_AUDIENCE.includes(req.query.audience)) query.audience = req.query.audience;
    if (req.query.q && String(req.query.q).trim()) query.$text = { $search: String(req.query.q).trim() };

    const sort = req.query.q ? { score: { $meta: 'textScore' }, order: 1, updatedAt: -1 } : { order: 1, updatedAt: -1 };
    const [items, total] = await Promise.all([
      OnboardingGuide.find(query)
        .select(req.query.q ? { score: { $meta: 'textScore' } } : {})
        .sort(sort)
        .skip(skip)
        .limit(limit),
      OnboardingGuide.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: items,
      total,
      count: items.length,
      currentPage: page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    return next(error);
  }
};

exports.createGuide = async (req, res, next) => {
  try {
    const title = sanitizeText(req.body.title);
    if (!title) return res.status(400).json({ success: false, message: 'title is required' });

    const steps = Array.isArray(req.body.steps)
      ? req.body.steps
          .map((step) => ({
            title: sanitizeText(step?.title),
            content: sanitizeRichText(step?.content),
            checklistKey: sanitizeText(step?.checklistKey)
          }))
          .filter((step) => step.title && step.content)
      : [];

    const status = HELP_STATUS.includes(req.body.status) ? req.body.status : 'DRAFT';

    const guide = await OnboardingGuide.create({
      title,
      slug: await ensureUniqueSlug(OnboardingGuide, req.body.slug || title),
      description: sanitizeText(req.body.description),
      steps,
      audience: GUIDE_AUDIENCE.includes(req.body.audience) ? req.body.audience : 'VENDOR',
      status,
      order: Number(req.body.order || 0),
      createdBy: req.user.id,
      updatedBy: req.user.id,
      publishedAt: status === 'PUBLISHED' ? new Date() : undefined
    });

    return res.status(201).json({ success: true, data: guide });
  } catch (error) {
    return next(error);
  }
};

exports.updateGuide = async (req, res, next) => {
  try {
    const guide = await OnboardingGuide.findById(req.params.id);
    if (!guide) return res.status(404).json({ success: false, message: 'Guide not found' });

    if (req.body.title !== undefined) guide.title = sanitizeText(req.body.title);
    if (req.body.description !== undefined) guide.description = sanitizeText(req.body.description);
    if (req.body.order !== undefined) guide.order = Number(req.body.order || 0);
    if (req.body.audience && GUIDE_AUDIENCE.includes(req.body.audience)) guide.audience = req.body.audience;
    if (req.body.status && HELP_STATUS.includes(req.body.status)) guide.status = req.body.status;

    if (Array.isArray(req.body.steps)) {
      guide.steps = req.body.steps
        .map((step) => ({
          title: sanitizeText(step?.title),
          content: sanitizeRichText(step?.content),
          checklistKey: sanitizeText(step?.checklistKey)
        }))
        .filter((step) => step.title && step.content);
    }

    if (req.body.slug !== undefined || req.body.title !== undefined) {
      guide.slug = await ensureUniqueSlug(OnboardingGuide, req.body.slug || req.body.title || guide.title, guide._id);
    }

    guide.publishedAt = guide.status === 'PUBLISHED' ? (guide.publishedAt || new Date()) : undefined;
    guide.updatedBy = req.user.id;

    await guide.save();
    return res.status(200).json({ success: true, data: guide });
  } catch (error) {
    return next(error);
  }
};

exports.publishGuide = async (req, res, next) => {
  try {
    const guide = await OnboardingGuide.findById(req.params.id);
    if (!guide) return res.status(404).json({ success: false, message: 'Guide not found' });

    guide.status = 'PUBLISHED';
    guide.publishedAt = new Date();
    guide.updatedBy = req.user.id;
    await guide.save();

    return res.status(200).json({ success: true, data: guide });
  } catch (error) {
    return next(error);
  }
};

exports.unpublishGuide = async (req, res, next) => {
  try {
    const guide = await OnboardingGuide.findById(req.params.id);
    if (!guide) return res.status(404).json({ success: false, message: 'Guide not found' });

    guide.status = req.body?.status === 'ARCHIVED' ? 'ARCHIVED' : 'DRAFT';
    guide.publishedAt = undefined;
    guide.updatedBy = req.user.id;
    await guide.save();

    return res.status(200).json({ success: true, data: guide });
  } catch (error) {
    return next(error);
  }
};

exports.deleteGuide = async (req, res, next) => {
  try {
    const guide = await OnboardingGuide.findById(req.params.id);
    if (!guide) return res.status(404).json({ success: false, message: 'Guide not found' });

    guide.status = 'ARCHIVED';
    guide.publishedAt = undefined;
    guide.updatedBy = req.user.id;
    await guide.save();

    return res.status(200).json({ success: true, message: 'Guide archived', data: guide });
  } catch (error) {
    return next(error);
  }
};

exports.listAdminVideos = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};

    if (req.query.status && HELP_STATUS.includes(req.query.status)) query.status = req.query.status;
    if (req.query.category && HELP_CATEGORIES.includes(req.query.category)) query.category = req.query.category;
    if (req.query.audience && HELP_AUDIENCE.includes(req.query.audience)) query.audience = req.query.audience;
    if (req.query.q && String(req.query.q).trim()) query.$text = { $search: String(req.query.q).trim() };

    const sort = req.query.q ? { score: { $meta: 'textScore' }, updatedAt: -1 } : { updatedAt: -1 };
    const [items, total] = await Promise.all([
      VideoTutorial.find(query).select(req.query.q ? { score: { $meta: 'textScore' } } : {}).sort(sort).skip(skip).limit(limit),
      VideoTutorial.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: items,
      total,
      count: items.length,
      currentPage: page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    return next(error);
  }
};

exports.createVideo = async (req, res, next) => {
  try {
    const title = sanitizeText(req.body.title);
    const videoUrl = sanitizeText(req.body.videoUrl);
    if (!title || !videoUrl) return res.status(400).json({ success: false, message: 'title and videoUrl are required' });

    const status = HELP_STATUS.includes(req.body.status) ? req.body.status : 'DRAFT';

    const video = await VideoTutorial.create({
      title,
      slug: await ensureUniqueSlug(VideoTutorial, req.body.slug || title),
      description: sanitizeText(req.body.description),
      videoType: ['YOUTUBE', 'VIMEO', 'LINK', 'UPLOAD'].includes(req.body.videoType) ? req.body.videoType : 'LINK',
      videoUrl,
      thumbnailUrl: sanitizeText(req.body.thumbnailUrl),
      category: HELP_CATEGORIES.includes(req.body.category) ? req.body.category : 'GENERAL',
      audience: HELP_AUDIENCE.includes(req.body.audience) ? req.body.audience : 'ALL',
      status,
      createdBy: req.user.id,
      updatedBy: req.user.id,
      publishedAt: status === 'PUBLISHED' ? new Date() : undefined
    });

    return res.status(201).json({ success: true, data: video });
  } catch (error) {
    return next(error);
  }
};

exports.updateVideo = async (req, res, next) => {
  try {
    const video = await VideoTutorial.findById(req.params.id);
    if (!video) return res.status(404).json({ success: false, message: 'Video tutorial not found' });

    if (req.body.title !== undefined) video.title = sanitizeText(req.body.title);
    if (req.body.description !== undefined) video.description = sanitizeText(req.body.description);
    if (req.body.videoType && ['YOUTUBE', 'VIMEO', 'LINK', 'UPLOAD'].includes(req.body.videoType)) video.videoType = req.body.videoType;
    if (req.body.videoUrl !== undefined) video.videoUrl = sanitizeText(req.body.videoUrl);
    if (req.body.thumbnailUrl !== undefined) video.thumbnailUrl = sanitizeText(req.body.thumbnailUrl);
    if (req.body.category && HELP_CATEGORIES.includes(req.body.category)) video.category = req.body.category;
    if (req.body.audience && HELP_AUDIENCE.includes(req.body.audience)) video.audience = req.body.audience;
    if (req.body.status && HELP_STATUS.includes(req.body.status)) video.status = req.body.status;

    if (req.body.slug !== undefined || req.body.title !== undefined) {
      video.slug = await ensureUniqueSlug(VideoTutorial, req.body.slug || req.body.title || video.title, video._id);
    }

    video.publishedAt = video.status === 'PUBLISHED' ? (video.publishedAt || new Date()) : undefined;
    video.updatedBy = req.user.id;
    await video.save();

    return res.status(200).json({ success: true, data: video });
  } catch (error) {
    return next(error);
  }
};

exports.publishVideo = async (req, res, next) => {
  try {
    const video = await VideoTutorial.findById(req.params.id);
    if (!video) return res.status(404).json({ success: false, message: 'Video tutorial not found' });

    video.status = 'PUBLISHED';
    video.publishedAt = new Date();
    video.updatedBy = req.user.id;
    await video.save();

    return res.status(200).json({ success: true, data: video });
  } catch (error) {
    return next(error);
  }
};

exports.unpublishVideo = async (req, res, next) => {
  try {
    const video = await VideoTutorial.findById(req.params.id);
    if (!video) return res.status(404).json({ success: false, message: 'Video tutorial not found' });

    video.status = req.body?.status === 'ARCHIVED' ? 'ARCHIVED' : 'DRAFT';
    video.publishedAt = undefined;
    video.updatedBy = req.user.id;
    await video.save();

    return res.status(200).json({ success: true, data: video });
  } catch (error) {
    return next(error);
  }
};

exports.deleteVideo = async (req, res, next) => {
  try {
    const video = await VideoTutorial.findById(req.params.id);
    if (!video) return res.status(404).json({ success: false, message: 'Video tutorial not found' });

    video.status = 'ARCHIVED';
    video.publishedAt = undefined;
    video.updatedBy = req.user.id;
    await video.save();

    return res.status(200).json({ success: true, message: 'Video tutorial archived', data: video });
  } catch (error) {
    return next(error);
  }
};

exports.getGuideProgress = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const guide = await OnboardingGuide.findOne({ slug, status: 'PUBLISHED' }).select('_id slug steps');
    if (!guide) return res.status(404).json({ success: false, message: 'Guide not found' });

    const vendor = await Vendor.findOne({ user: req.user.id }).select('_id');
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor profile not found' });

    const progress = await VendorOnboardingProgress.findOne({ vendorId: vendor._id, guideSlug: slug });
    return res.status(200).json({
      success: true,
      data: progress || { guideSlug: slug, completedSteps: [], completed: false }
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateGuideProgress = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const guide = await OnboardingGuide.findOne({ slug, status: 'PUBLISHED' }).select('_id slug steps');
    if (!guide) return res.status(404).json({ success: false, message: 'Guide not found' });

    const vendor = await Vendor.findOne({ user: req.user.id }).select('_id');
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor profile not found' });

    const completedSteps = Array.isArray(req.body.completedSteps)
      ? req.body.completedSteps
          .map((index) => Number(index))
          .filter((index) => Number.isInteger(index) && index >= 0 && index < guide.steps.length)
      : [];

    const uniqueSteps = [...new Set(completedSteps)].sort((a, b) => a - b);
    const completed = uniqueSteps.length > 0 && uniqueSteps.length === guide.steps.length;

    const progress = await VendorOnboardingProgress.findOneAndUpdate(
      { vendorId: vendor._id, guideSlug: slug },
      { completedSteps: uniqueSteps, completed },
      { new: true, upsert: true }
    );

    return res.status(200).json({ success: true, data: progress });
  } catch (error) {
    return next(error);
  }
};
