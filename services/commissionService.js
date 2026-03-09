const PlatformSettings = require('../models/PlatformSettings');
const Product = require('../models/Product');
const VendorTransaction = require('../models/VendorTransaction');

function roundCurrency(value) {
  return Number((Number(value || 0)).toFixed(2));
}

async function resolveCommissionPercent({ vendorId, productCategory, settings }) {
  const perVendor = Number(settings?.perVendorCommission?.get?.(String(vendorId)));
  if (Number.isFinite(perVendor)) return perVendor;

  const perCategory = Number(settings?.perCategoryCommission?.get?.(String(productCategory || '').toLowerCase()));
  if (Number.isFinite(perCategory)) return perCategory;

  return Number(settings?.defaultCommissionPercent || 0);
}

async function applyCommissionToOrder(order) {
  if (!order || !Array.isArray(order.items) || !order.items.length) return;
  if (String(order.paymentStatus || '').toUpperCase() !== 'PAID') return;

  const settings = await PlatformSettings.findOne({}).sort({ createdAt: -1 });
  const productIds = order.items.map((item) => item.productId || item.product).filter(Boolean);
  const products = await Product.find({ _id: { $in: productIds } }).select('_id category');
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  let hasChanges = false;
  for (const item of order.items) {
    const vendorId = item.vendorId || item.vendor;
    if (!vendorId) continue;

    const productId = item.productId || item.product;
    const product = productMap.get(String(productId));
    const gross = roundCurrency(item.subtotal || item.lineTotal || (item.price * item.quantity));
    const commissionPercent = await resolveCommissionPercent({
      vendorId,
      productCategory: product?.category,
      settings
    });
    const commissionAmount = roundCurrency((gross * commissionPercent) / 100);
    const vendorNet = roundCurrency(gross - commissionAmount);

    item.vendorGross = gross;
    item.commissionPercent = commissionPercent;
    item.commissionAmount = commissionAmount;
    item.vendorNet = vendorNet;
    hasChanges = true;

    const referenceBase = `ORDER:${order.orderNumber || order._id}:VENDOR:${vendorId}`;
    const existingSaleCredit = await VendorTransaction.findOne({
      vendorId,
      orderId: order._id,
      type: 'SALE',
      direction: 'CREDIT',
      reference: `${referenceBase}:SALE_CREDIT`
    });

    if (!existingSaleCredit) {
      await VendorTransaction.create({
        vendorId,
        type: 'SALE',
        direction: 'CREDIT',
        orderId: order._id,
        amount: vendorNet,
        reference: `${referenceBase}:SALE_CREDIT`,
        description: `Net sale credit for order ${order.orderNumber || order._id}`,
        status: 'COMPLETED',
        metadata: {
          vendorGross: gross,
          commissionPercent,
          commissionAmount
        }
      });
    }

    const existingCommission = await VendorTransaction.findOne({
      vendorId,
      orderId: order._id,
      type: 'COMMISSION',
      direction: 'DEBIT',
      reference: `${referenceBase}:COMMISSION_DEBIT`
    });
    if (!existingCommission) {
      await VendorTransaction.create({
        vendorId,
        type: 'COMMISSION',
        direction: 'DEBIT',
        orderId: order._id,
        amount: commissionAmount,
        reference: `${referenceBase}:COMMISSION_DEBIT`,
        description: `Platform commission for order ${order.orderNumber || order._id}`,
        status: 'COMPLETED',
        metadata: {
          vendorGross: gross,
          commissionPercent
        }
      });
    }
  }

  if (hasChanges) {
    await order.save();
  }
}

module.exports = {
  applyCommissionToOrder
};
