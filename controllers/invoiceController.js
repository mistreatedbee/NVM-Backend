const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Order = require('../models/Order');
const Vendor = require('../models/Vendor');
const AuditLog = require('../models/AuditLog');
const { issueInvoicesForOrder } = require('../services/invoiceService');
const { generateInvoicePdfBuffer } = require('../services/invoicePdfService');

function isObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

async function resolveVendorIdForUser(userId) {
  const vendor = await Vendor.findOne({ user: userId }).select('_id');
  return vendor?._id || null;
}

async function logInvoiceAudit(action, invoice, actor) {
  await AuditLog.create({
    actorId: actor?.id || null,
    actorRole: actor?.role === 'admin' ? 'Admin' : actor?.role === 'vendor' ? 'Vendor' : actor?.role === 'customer' ? 'Customer' : 'System',
    action,
    entityType: 'Invoice',
    entityId: invoice._id,
    metadata: {
      invoiceId: String(invoice._id),
      invoiceNumber: invoice.invoiceNumber,
      orderId: String(invoice.orderId),
      type: invoice.type
    }
  });
}

function buildInvoiceQueryForAdmin(query) {
  const mongoQuery = {};
  if (query.vendorId && isObjectId(query.vendorId)) mongoQuery.vendorId = query.vendorId;
  if (query.customerId && isObjectId(query.customerId)) mongoQuery.customerId = query.customerId;
  if (query.orderId && isObjectId(query.orderId)) mongoQuery.orderId = query.orderId;
  if (query.status) mongoQuery.status = String(query.status).toUpperCase();
  if (query.q) {
    mongoQuery.$or = [
      { invoiceNumber: { $regex: String(query.q).trim(), $options: 'i' } },
      { 'metadata.orderNumber': { $regex: String(query.q).trim(), $options: 'i' } }
    ];
  }
  return mongoQuery;
}

async function fetchInvoiceForCustomer(invoiceId, customerId) {
  return Invoice.findOne({ _id: invoiceId, customerId, type: 'CUSTOMER' });
}

async function fetchInvoiceForVendor(invoiceId, userId) {
  const vendorId = await resolveVendorIdForUser(userId);
  if (!vendorId) return null;
  return Invoice.findOne({ _id: invoiceId, vendorId, type: 'VENDOR' });
}

async function streamInvoicePdf(res, invoice, actor) {
  const buffer = await generateInvoicePdfBuffer(invoice.toObject());
  await Invoice.updateOne(
    { _id: invoice._id },
    {
      $set: {
        'pdf.generatedAt': new Date()
      }
    }
  );

  await logInvoiceAudit('INVOICE_PDF_GENERATED', invoice, actor);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${invoice.invoiceNumber}.pdf`);
  return res.status(200).send(buffer);
}

exports.getMyInvoices = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = { customerId: req.user.id, type: 'CUSTOMER' };
    const [data, total] = await Promise.all([
      Invoice.find(query).sort({ issuedAt: -1 }).skip(skip).limit(limit),
      Invoice.countDocuments(query)
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

exports.getMyInvoiceById = async (req, res, next) => {
  try {
    if (!isObjectId(req.params.invoiceId)) {
      return res.status(400).json({ success: false, message: 'Invalid invoice id' });
    }
    const invoice = await fetchInvoiceForCustomer(req.params.invoiceId, req.user.id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    return res.status(200).json({ success: true, data: invoice });
  } catch (error) {
    return next(error);
  }
};

exports.downloadMyInvoicePdf = async (req, res, next) => {
  try {
    if (!isObjectId(req.params.invoiceId)) {
      return res.status(400).json({ success: false, message: 'Invalid invoice id' });
    }
    const invoice = await fetchInvoiceForCustomer(req.params.invoiceId, req.user.id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    return streamInvoicePdf(res, invoice, { id: req.user.id, role: req.user.role });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorInvoices = async (req, res, next) => {
  try {
    const vendorId = await resolveVendorIdForUser(req.user.id);
    if (!vendorId) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    }
    const { page, limit, skip } = parsePagination(req.query);
    const query = { vendorId, type: 'VENDOR' };
    if (req.query.status) query.status = String(req.query.status).toUpperCase();

    const [data, total] = await Promise.all([
      Invoice.find(query).sort({ issuedAt: -1 }).skip(skip).limit(limit),
      Invoice.countDocuments(query)
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

exports.getVendorInvoiceById = async (req, res, next) => {
  try {
    if (!isObjectId(req.params.invoiceId)) {
      return res.status(400).json({ success: false, message: 'Invalid invoice id' });
    }
    const invoice = await fetchInvoiceForVendor(req.params.invoiceId, req.user.id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    return res.status(200).json({ success: true, data: invoice });
  } catch (error) {
    return next(error);
  }
};

exports.downloadVendorInvoicePdf = async (req, res, next) => {
  try {
    if (!isObjectId(req.params.invoiceId)) {
      return res.status(400).json({ success: false, message: 'Invalid invoice id' });
    }
    const invoice = await fetchInvoiceForVendor(req.params.invoiceId, req.user.id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    return streamInvoicePdf(res, invoice, { id: req.user.id, role: req.user.role });
  } catch (error) {
    return next(error);
  }
};

exports.getAdminInvoices = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = buildInvoiceQueryForAdmin(req.query);
    const [data, total] = await Promise.all([
      Invoice.find(query).sort({ issuedAt: -1 }).skip(skip).limit(limit),
      Invoice.countDocuments(query)
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

exports.getAdminInvoiceById = async (req, res, next) => {
  try {
    if (!isObjectId(req.params.invoiceId)) {
      return res.status(400).json({ success: false, message: 'Invalid invoice id' });
    }
    const invoice = await Invoice.findById(req.params.invoiceId);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    return res.status(200).json({ success: true, data: invoice });
  } catch (error) {
    return next(error);
  }
};

exports.regenerateAdminInvoicePdf = async (req, res, next) => {
  try {
    if (!isObjectId(req.params.invoiceId)) {
      return res.status(400).json({ success: false, message: 'Invalid invoice id' });
    }
    const invoice = await Invoice.findById(req.params.invoiceId);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    await generateInvoicePdfBuffer(invoice.toObject());
    await Invoice.updateOne({ _id: invoice._id }, { $set: { 'pdf.generatedAt': new Date() } });
    await logInvoiceAudit('INVOICE_PDF_REGENERATED', invoice, { id: req.user.id, role: req.user.role });
    return res.status(200).json({ success: true, message: 'PDF regenerated successfully' });
  } catch (error) {
    return next(error);
  }
};

exports.voidInvoice = async (req, res, next) => {
  try {
    if (!isObjectId(req.params.invoiceId)) {
      return res.status(400).json({ success: false, message: 'Invalid invoice id' });
    }
    const reason = String(req.body.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Void reason is required' });
    }

    const invoice = await Invoice.findById(req.params.invoiceId);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    invoice.status = 'VOID';
    invoice.voidReason = reason;
    invoice.voidedAt = new Date();
    invoice.voidedBy = req.user.id;
    await invoice.save();

    await logInvoiceAudit('INVOICE_VOIDED', invoice, { id: req.user.id, role: req.user.role });

    return res.status(200).json({ success: true, data: invoice });
  } catch (error) {
    return next(error);
  }
};

// Legacy compatibility route: GET /api/invoices/:orderId
exports.generateInvoice = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!isObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const isCustomer = String(order.customerId || order.customer) === String(req.user.id);
    let isVendor = false;
    if (!isCustomer && req.user.role === 'vendor') {
      const vendorId = await resolveVendorIdForUser(req.user.id);
      isVendor = !!vendorId && (order.items || []).some((item) => String(item.vendorId || item.vendor) === String(vendorId));
    }
    if (req.user.role !== 'admin' && !isCustomer && !isVendor) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this invoice' });
    }

    await issueInvoicesForOrder({ orderId: order._id, actorId: req.user.id, force: true });

    let invoice;
    if (req.user.role === 'vendor' && !isCustomer) {
      const vendorId = await resolveVendorIdForUser(req.user.id);
      invoice = await Invoice.findOne({ orderId, vendorId, type: 'VENDOR' });
    } else {
      invoice = await Invoice.findOne({ orderId, type: 'CUSTOMER' });
    }
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    return streamInvoicePdf(res, invoice, { id: req.user.id, role: req.user.role });
  } catch (error) {
    return next(error);
  }
};

// Legacy compatibility route: GET /api/invoices/:orderId/data
exports.getInvoiceData = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!isObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const isCustomer = String(order.customerId || order.customer) === String(req.user.id);
    if (req.user.role !== 'admin' && !isCustomer) {
      const vendorId = await resolveVendorIdForUser(req.user.id);
      const isVendor = !!vendorId && (order.items || []).some((item) => String(item.vendorId || item.vendor) === String(vendorId));
      if (!isVendor) {
        return res.status(403).json({ success: false, message: 'Not authorized to view invoice data' });
      }
    }

    await issueInvoicesForOrder({ orderId: order._id, actorId: req.user.id, force: true });

    const invoices = await Invoice.find({ orderId }).sort({ type: 1, issuedAt: -1 });
    return res.status(200).json({
      success: true,
      data: invoices
    });
  } catch (error) {
    return next(error);
  }
};
