const Product = require('../models/Product');
const DeliveryZone = require('../models/DeliveryZone');
const VendorDeliveryConfig = require('../models/VendorDeliveryConfig');
const PickupPoint = require('../models/PickupPoint');

function toRad(value) {
  return (value * Math.PI) / 180;
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function resolveCoordinates(address = {}) {
  const lat = Number(address.lat ?? address.latitude);
  const lng = Number(address.lng ?? address.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

async function calculateDeliveryFee({ customerAddress, cartItems }) {
  const coords = resolveCoordinates(customerAddress);
  if (!coords) {
    return {
      options: [],
      totalDeliveryFee: 0,
      breakdown: [],
      message: 'Address coordinates (lat,lng) are required for delivery quote.'
    };
  }

  const normalizedItems = Array.isArray(cartItems) ? cartItems : [];
  if (!normalizedItems.length) {
    return { options: [], totalDeliveryFee: 0, breakdown: [] };
  }

  const productIds = normalizedItems.map((item) => item.productId || item.product).filter(Boolean);
  const products = await Product.find({ _id: { $in: productIds } }).select('_id vendor price');
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const vendorSubtotal = new Map();
  for (const item of normalizedItems) {
    const key = String(item.productId || item.product || '');
    const product = productMap.get(key);
    if (!product) continue;
    const quantity = Math.max(Number(item.quantity) || 1, 1);
    const subtotal = quantity * Number(item.price || product.price || 0);
    const vendorId = String(product.vendor);
    vendorSubtotal.set(vendorId, (vendorSubtotal.get(vendorId) || 0) + subtotal);
  }

  const vendorIds = [...vendorSubtotal.keys()];
  const [zones, configs, pickupPoints] = await Promise.all([
    DeliveryZone.find({ isActive: true }).sort({ sortOrder: 1 }).lean(),
    VendorDeliveryConfig.find({ vendorId: { $in: vendorIds } }).lean(),
    PickupPoint.find({ isActive: true, $or: [{ vendorId: { $in: vendorIds } }, { vendorId: null }] })
      .select('vendorId')
      .lean()
  ]);

  const configMap = new Map(configs.map((c) => [String(c.vendorId), c]));
  const pickupVendors = new Set(pickupPoints.map((p) => (p.vendorId ? String(p.vendorId) : 'platform')));
  const breakdown = [];
  let totalDeliveryFee = 0;
  let maxEstimatedDays = 1;

  for (const vendorId of vendorIds) {
    const config = configMap.get(vendorId);
    const allowedZoneSet = config?.enabledZones?.length
      ? new Set(config.enabledZones.map((id) => String(id)))
      : null;

    let matchedZone = null;
    let matchedDistance = null;

    for (const zone of zones) {
      if (allowedZoneSet && !allowedZoneSet.has(String(zone._id))) continue;
      const d = distanceKm(coords.lat, coords.lng, Number(zone.center.lat), Number(zone.center.lng));
      if (d <= Number(zone.radiusKm)) {
        matchedZone = zone;
        matchedDistance = d;
        break;
      }
    }

    const subtotal = vendorSubtotal.get(vendorId) || 0;
    let fee = 0;
    let zoneId = null;
    if (matchedZone) {
      zoneId = matchedZone._id;
      fee = Number(matchedZone.baseFee || 0) + Number(matchedZone.feePerKm || 0) * Number(matchedDistance || 0);
      if (matchedZone.minimumOrderValue && subtotal < Number(matchedZone.minimumOrderValue)) {
        fee += Number(matchedZone.baseFee || 0);
      }
      if (config?.freeDeliveryThreshold && subtotal >= Number(config.freeDeliveryThreshold)) {
        fee = 0;
      }
      maxEstimatedDays = Math.max(maxEstimatedDays, Number(matchedZone.estimatedDays || 2));
    } else {
      fee = 0;
    }

    fee = Number(fee.toFixed(2));
    totalDeliveryFee += fee;

    breakdown.push({
      vendorId,
      zoneId,
      subtotal: Number(subtotal.toFixed(2)),
      deliveryFee: fee,
      pickupEnabled: Boolean(config?.pickupEnabled) && (pickupVendors.has(vendorId) || pickupVendors.has('platform'))
    });
  }

  const allPickupCapable = breakdown.length > 0 && breakdown.every((b) => b.pickupEnabled);
  const options = [
    {
      method: 'DELIVERY',
      fee: Number(totalDeliveryFee.toFixed(2)),
      estimatedDays: maxEstimatedDays,
      perVendor: breakdown
    }
  ];

  if (allPickupCapable) {
    options.push({
      method: 'PICKUP',
      fee: 0,
      estimatedDays: 1,
      perVendor: breakdown.map((b) => ({ vendorId: b.vendorId, fee: 0 }))
    });
  }

  return {
    options,
    totalDeliveryFee: Number(totalDeliveryFee.toFixed(2)),
    breakdown
  };
}

module.exports = {
  calculateDeliveryFee
};
