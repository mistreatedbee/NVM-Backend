const crypto = require('crypto');
const ProductAnalyticsEvent = require('../models/ProductAnalyticsEvent');

function getIpHash(req) {
  const ip = req.headers['x-forwarded-for'] || req.ip || '';
  const userAgent = req.headers['user-agent'] || '';
  return crypto.createHash('sha256').update(`${ip}|${userAgent}`).digest('hex');
}

function mapSource(source) {
  const allowed = new Set(['SEARCH', 'HOMEPAGE', 'VENDOR_PAGE', 'DIRECT', 'OTHER']);
  const value = String(source || 'OTHER').toUpperCase();
  return allowed.has(value) ? value : 'OTHER';
}

async function trackProductEvent({ product, eventType, userId, sessionId, ipHash, source, orderId }) {
  if (!product?._id || !product?.vendor) return;
  const payload = {
    vendorId: product.vendor,
    productId: product._id,
    eventType,
    userId: userId || undefined,
    sessionId: sessionId || undefined,
    ipHash: ipHash || undefined,
    source: mapSource(source),
    orderId: orderId || undefined
  };

  if (eventType === 'PURCHASE' && orderId) {
    try {
      await ProductAnalyticsEvent.updateOne(
        { orderId, productId: product._id, eventType: 'PURCHASE' },
        { $setOnInsert: payload },
        { upsert: true }
      );
      return;
    } catch (error) {
      if (error?.code === 11000) return;
      throw error;
    }
  }

  await ProductAnalyticsEvent.create(payload);
}

async function recordPurchaseEventsForOrder({ order, source = 'DIRECT', actorUserId }) {
  if (!order?.items?.length) return;
  const baseOrderId = order._id;
  const ops = order.items.map((item) =>
    trackProductEvent({
      product: { _id: item.product || item.productId, vendor: item.vendor || item.vendorId },
      eventType: 'PURCHASE',
      userId: actorUserId,
      source,
      orderId: baseOrderId
    })
  );
  await Promise.all(ops);
}

module.exports = {
  getIpHash,
  mapSource,
  trackProductEvent,
  recordPurchaseEventsForOrder
};
