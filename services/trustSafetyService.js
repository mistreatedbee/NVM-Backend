const FraudFlag = require('../models/FraudFlag');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildHeuristics(order = {}) {
  const flags = [];
  const total = toNumber(order.total, 0);
  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
  const quantityTotal = (order.items || []).reduce((sum, item) => sum + toNumber(item.qty || item.quantity, 0), 0);

  const highValueThreshold = toNumber(process.env.FRAUD_HIGH_VALUE_ORDER_TOTAL, 50000);
  const bulkQtyThreshold = toNumber(process.env.FRAUD_BULK_QTY_THRESHOLD, 25);
  const multiVendorThreshold = toNumber(process.env.FRAUD_MULTI_VENDOR_THRESHOLD, 4);

  if (total >= highValueThreshold) {
    flags.push({
      level: 'HIGH',
      reason: `Order total ${total} exceeds high-value threshold ${highValueThreshold}`
    });
  }

  if (quantityTotal >= bulkQtyThreshold) {
    flags.push({
      level: 'MEDIUM',
      reason: `Order quantity ${quantityTotal} exceeds bulk threshold ${bulkQtyThreshold}`
    });
  }

  const uniqueVendors = new Set((order.items || []).map((item) => String(item.vendorId || item.vendor || '')).filter(Boolean));
  if (uniqueVendors.size >= multiVendorThreshold) {
    flags.push({
      level: 'LOW',
      reason: `Order spans ${uniqueVendors.size} vendors (threshold ${multiVendorThreshold})`
    });
  }

  if (itemCount === 0) {
    flags.push({
      level: 'HIGH',
      reason: 'Order created with zero items'
    });
  }

  return flags;
}

async function evaluateFraudRules({ entityType, entityId, createdBy, order }) {
  if (String(entityType || '').toUpperCase() !== 'ORDER') {
    return [];
  }

  const orderId = entityId || order?._id;
  if (!orderId) return [];

  const candidates = buildHeuristics(order || {});
  if (!candidates.length) return [];

  const existingOpen = await FraudFlag.find({ orderId, status: 'OPEN' }).select('reason');
  const existingReasons = new Set(existingOpen.map((item) => String(item.reason)));

  const toCreate = candidates.filter((candidate) => !existingReasons.has(candidate.reason));
  if (!toCreate.length) return [];

  const created = await FraudFlag.insertMany(
    toCreate.map((candidate) => ({
      orderId,
      level: candidate.level,
      reason: candidate.reason,
      status: 'OPEN',
      createdBy: createdBy || null
    }))
  );

  return created;
}

module.exports = {
  evaluateFraudRules
};
