const Invoice = require('../models/Invoice');
const Counter = require('../models/Counter');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Order = require('../models/Order');
const VendorTransaction = require('../models/VendorTransaction');
const AuditLog = require('../models/AuditLog');

function normalizePaidStatus(status) {
  return String(status || '').toUpperCase();
}

function buildInvoiceNumber(sequence) {
  const year = new Date().getFullYear();
  return `INV-${year}-${String(sequence).padStart(6, '0')}`;
}

async function getNextInvoiceNumber() {
  const counter = await Counter.findOneAndUpdate(
    { name: 'invoice' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return buildInvoiceNumber(counter.seq);
}

function mapVendorBanking(vendor) {
  const bankDetails = vendor?.bankDetails || {};
  return {
    bankName: bankDetails.bankName || '',
    accountHolder: bankDetails.accountHolder || bankDetails.accountHolderName || '',
    accountNumber: bankDetails.accountNumber || '',
    branchCode: bankDetails.branchCode || '',
    accountType: bankDetails.accountType || '',
    payoutEmail: bankDetails.payoutEmail || '',
    payoutReference: bankDetails.payoutReference || ''
  };
}

function mapVendorSnapshot(vendor) {
  if (!vendor) return null;
  return {
    storeName: vendor.storeName || '',
    contact: {
      name: vendor.storeName || '',
      email: vendor.email || '',
      phone: vendor.phone || ''
    },
    location: {
      country: vendor.location?.country || vendor.address?.country || '',
      state: vendor.location?.state || vendor.address?.state || '',
      city: vendor.location?.city || vendor.address?.city || '',
      suburb: vendor.location?.suburb || '',
      addressLine: vendor.location?.addressLine || vendor.address?.street || ''
    },
    banking: mapVendorBanking(vendor)
  };
}

function mapBillingSnapshot(customer, order) {
  const address = order.billingAddress || order.shippingAddress || order.deliveryAddress || {};
  return {
    name: address.fullName || customer?.name || '',
    email: customer?.email || '',
    phone: address.phone || customer?.phone || '',
    address: {
      fullName: address.fullName || '',
      street: address.street || '',
      city: address.city || '',
      state: address.state || '',
      country: address.country || '',
      zipCode: address.zipCode || ''
    }
  };
}

function normalizeOrderLine(item) {
  const qty = item.qty || item.quantity || 0;
  const unitPrice = item.priceSnapshot ?? item.price ?? 0;
  const lineTotal = item.lineTotal ?? item.subtotal ?? unitPrice * qty;
  return {
    productId: item.productId || item.product,
    titleSnapshot: item.titleSnapshot || item.name || 'Product',
    skuSnapshot: item.skuSnapshot || '',
    qty,
    unitPrice,
    lineTotal
  };
}

async function ensureVendorLedgerEntry(entry, actorId) {
  const existing = await VendorTransaction.findOne({
    vendorId: entry.vendorId,
    orderId: entry.orderId,
    invoiceId: entry.invoiceId,
    type: entry.type,
    direction: entry.direction
  });
  if (existing) return existing;

  const tx = await VendorTransaction.create(entry);
  await AuditLog.create({
    actorId: actorId || null,
    actorRole: actorId ? 'Admin' : 'System',
    action: 'VENDOR_TRANSACTION_CREATED',
    entityType: 'VendorTransaction',
    entityId: tx._id,
    metadata: {
      vendorId: String(tx.vendorId),
      type: tx.type,
      direction: tx.direction,
      amount: tx.amount,
      orderId: tx.orderId ? String(tx.orderId) : null,
      invoiceId: tx.invoiceId ? String(tx.invoiceId) : null
    }
  });
  return tx;
}

async function createInvoiceDocument(payload, actorId) {
  let invoice;
  try {
    const invoiceNumber = await getNextInvoiceNumber();
    invoice = await Invoice.create({
      ...payload,
      invoiceNumber,
      issuedAt: new Date()
    });
  } catch (error) {
    if (error?.code === 11000) {
      invoice = await Invoice.findOne({
        type: payload.type,
        orderId: payload.orderId,
        vendorId: payload.vendorId || null
      });
      if (invoice) return invoice;
    }
    throw error;
  }

  await AuditLog.create({
    actorId: actorId || null,
    actorRole: actorId ? 'Admin' : 'System',
    action: 'INVOICE_CREATED',
    entityType: 'Invoice',
    entityId: invoice._id,
    metadata: {
      invoiceNumber: invoice.invoiceNumber,
      orderId: String(invoice.orderId),
      customerId: String(invoice.customerId),
      vendorId: invoice.vendorId ? String(invoice.vendorId) : null,
      type: invoice.type
    }
  });

  return invoice;
}

function shouldGenerateForOrder(order) {
  return Boolean(order);
}

async function issueInvoicesForOrder({ orderId, actorId = null, force = false }) {
  const order = await Order.findById(orderId);
  if (!order) {
    const error = new Error('Order not found');
    error.statusCode = 404;
    throw error;
  }

  if (!force && !shouldGenerateForOrder(order)) {
    return { created: [], existing: [], skipped: true, reason: 'Order payment is not confirmed yet' };
  }

  const customer = await User.findById(order.customerId || order.customer).select('name email phone');
  if (!customer) {
    const error = new Error('Order customer not found');
    error.statusCode = 422;
    throw error;
  }

  const existingInvoices = await Invoice.find({ orderId: order._id });
  const existingByKey = new Map();
  for (const inv of existingInvoices) {
    const key = inv.type === 'CUSTOMER' ? 'CUSTOMER' : `VENDOR:${String(inv.vendorId)}`;
    existingByKey.set(key, inv);
  }

  const created = [];
  const existing = [...existingInvoices];
  const invoiceIds = existingInvoices.map((inv) => inv._id);

  if (!existingByKey.has('CUSTOMER')) {
    const customerLineItems = (order.items || []).map(normalizeOrderLine);
    const customerInvoice = await createInvoiceDocument(
      {
        orderId: order._id,
        customerId: customer._id,
        vendorId: null,
        type: 'CUSTOMER',
        status: 'ISSUED',
        currency: 'ZAR',
        billingDetails: mapBillingSnapshot(customer, order),
        vendorDetails: null,
        lineItems: customerLineItems,
        totals: {
          subtotal: Number(order.subtotal || 0),
          deliveryFee: Number(order.deliveryFee ?? order.shippingCost ?? 0),
          discount: Number(order.discount || 0),
          tax: Number(order.tax || 0),
          total: Number(order.total || 0)
        },
        metadata: {
          orderNumber: order.orderNumber,
          paymentMethod: order.paymentMethod,
          paymentStatus: normalizePaidStatus(order.paymentStatus)
        }
      },
      actorId
    );
    created.push(customerInvoice);
    invoiceIds.push(customerInvoice._id);
  }

  const vendorIds = [...new Set((order.items || []).map((item) => String(item.vendorId || item.vendor)).filter(Boolean))];
  const vendors = await Vendor.find({ _id: { $in: vendorIds } });
  const vendorMap = new Map(vendors.map((vendor) => [String(vendor._id), vendor]));

  const commissionRate = Math.max(0, Number(process.env.VENDOR_COMMISSION_RATE || 0));

  for (const vendorId of vendorIds) {
    const key = `VENDOR:${vendorId}`;
    const orderItems = (order.items || []).filter((item) => String(item.vendorId || item.vendor) === vendorId);
    if (!orderItems.length) continue;

    const lineItems = orderItems.map(normalizeOrderLine);
    const subtotal = lineItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
    if (subtotal <= 0) continue;

    let vendorInvoice = existingByKey.get(key);
    if (!vendorInvoice) {
      const vendor = vendorMap.get(vendorId);
      vendorInvoice = await createInvoiceDocument(
        {
          orderId: order._id,
          customerId: customer._id,
          vendorId,
          type: 'VENDOR',
          status: 'ISSUED',
          currency: 'ZAR',
          billingDetails: mapBillingSnapshot(customer, order),
          vendorDetails: mapVendorSnapshot(vendor),
          lineItems,
          totals: {
            subtotal,
            deliveryFee: 0,
            discount: 0,
            tax: 0,
            total: subtotal
          },
          metadata: {
            orderNumber: order.orderNumber,
            paymentMethod: order.paymentMethod,
            paymentStatus: normalizePaidStatus(order.paymentStatus)
          }
        },
        actorId
      );
      created.push(vendorInvoice);
      invoiceIds.push(vendorInvoice._id);
    }

    await ensureVendorLedgerEntry(
      {
        vendorId,
        type: 'SALE',
        direction: 'CREDIT',
        orderId: order._id,
        invoiceId: vendorInvoice._id,
        amount: subtotal,
        currency: 'ZAR',
        reference: `Order #${order.orderNumber}`,
        description: `Sale credit for invoice ${vendorInvoice.invoiceNumber}`,
        status: 'COMPLETED',
        metadata: {
          invoiceNumber: vendorInvoice.invoiceNumber,
          orderNumber: order.orderNumber
        }
      },
      actorId
    );

    if (commissionRate > 0) {
      const commission = Number((subtotal * commissionRate).toFixed(2));
      if (commission > 0) {
        await ensureVendorLedgerEntry(
          {
            vendorId,
            type: 'COMMISSION',
            direction: 'DEBIT',
            orderId: order._id,
            invoiceId: vendorInvoice._id,
            amount: commission,
            currency: 'ZAR',
            reference: `Order #${order.orderNumber}`,
            description: `Commission debit (${Math.round(commissionRate * 100)}%) for invoice ${vendorInvoice.invoiceNumber}`,
            status: 'COMPLETED',
            metadata: {
              invoiceNumber: vendorInvoice.invoiceNumber,
              orderNumber: order.orderNumber,
              commissionRate
            }
          },
          actorId
        );
      }
    }
  }

  await Order.findByIdAndUpdate(order._id, {
    $set: { invoicesGeneratedAt: new Date() },
    $addToSet: { invoiceIds: { $each: invoiceIds } }
  });

  return {
    created,
    existing,
    skipped: false
  };
}

module.exports = {
  issueInvoicesForOrder,
  shouldGenerateForOrder,
  getNextInvoiceNumber
};
