const DeliveryZone = require('../models/DeliveryZone');
const VendorDeliveryConfig = require('../models/VendorDeliveryConfig');
const PickupPoint = require('../models/PickupPoint');
const Vendor = require('../models/Vendor');
const { calculateDeliveryFee } = require('../services/logisticsService');
const { getPaginationParams, paginatedResult } = require('../utils/pagination');
const { logAudit, resolveIp } = require('../services/loggingService');

function toPoint(location = {}) {
  const lat = Number(location.lat ?? location.latitude);
  const lng = Number(location.lng ?? location.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { type: 'Point', coordinates: [lng, lat] };
}

exports.getAdminZones = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query, { limit: 20, maxLimit: 100 });
    const [zones, total] = await Promise.all([
      DeliveryZone.find({}).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit),
      DeliveryZone.countDocuments({})
    ]);
    return res.json({ success: true, ...paginatedResult({ data: zones, page, limit, total }) });
  } catch (error) {
    return next(error);
  }
};

exports.createZone = async (req, res, next) => {
  try {
    const zone = await DeliveryZone.create(req.body);
    await logAudit({
      actorAdminId: req.user.id,
      actionType: 'SYSTEM_ALERT_CREATED',
      targetType: 'SYSTEM',
      targetId: null,
      metadata: { module: 'LOGISTICS', action: 'ZONE_CREATE', zoneId: zone._id, payload: req.body },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
    });
    return res.status(201).json({ success: true, data: zone });
  } catch (error) {
    return next(error);
  }
};

exports.updateZone = async (req, res, next) => {
  try {
    const zone = await DeliveryZone.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!zone) return res.status(404).json({ success: false, message: 'Delivery zone not found' });
    await logAudit({
      actorAdminId: req.user.id,
      actionType: 'SYSTEM_ALERT_CREATED',
      targetType: 'SYSTEM',
      targetId: null,
      metadata: { module: 'LOGISTICS', action: 'ZONE_UPDATE', zoneId: zone._id, payload: req.body },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
    });
    return res.json({ success: true, data: zone });
  } catch (error) {
    return next(error);
  }
};

exports.activateZone = async (req, res, next) => {
  try {
    const zone = await DeliveryZone.findByIdAndUpdate(
      req.params.id,
      { isActive: Boolean(req.body.isActive) },
      { new: true }
    );
    if (!zone) return res.status(404).json({ success: false, message: 'Delivery zone not found' });
    await logAudit({
      actorAdminId: req.user.id,
      actionType: 'SYSTEM_ALERT_CREATED',
      targetType: 'SYSTEM',
      targetId: null,
      metadata: { module: 'LOGISTICS', action: 'ZONE_TOGGLE', zoneId: zone._id, isActive: zone.isActive },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
    });
    return res.json({ success: true, data: zone });
  } catch (error) {
    return next(error);
  }
};

exports.reorderZones = async (req, res, next) => {
  try {
    const orderedIds = Array.isArray(req.body.orderedIds) ? req.body.orderedIds : [];
    if (!orderedIds.length) return res.status(400).json({ success: false, message: 'orderedIds is required' });

    await Promise.all(
      orderedIds.map((id, index) => DeliveryZone.findByIdAndUpdate(id, { sortOrder: index }))
    );

    await logAudit({
      actorAdminId: req.user.id,
      actionType: 'SYSTEM_ALERT_CREATED',
      targetType: 'SYSTEM',
      targetId: null,
      metadata: { module: 'LOGISTICS', action: 'ZONE_REORDER', orderedIds },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
    });

    return res.json({ success: true, message: 'Zones reordered' });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorLogisticsSettings = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user.id }).select('_id');
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    const settings = await VendorDeliveryConfig.findOne({ vendorId: vendor._id });
    return res.json({
      success: true,
      data: settings || {
        vendorId: vendor._id,
        enabledZones: [],
        freeDeliveryThreshold: null,
        pickupEnabled: false
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateVendorLogisticsSettings = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user.id }).select('_id');
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    const payload = {
      enabledZones: Array.isArray(req.body.enabledZones) ? req.body.enabledZones : [],
      freeDeliveryThreshold: req.body.freeDeliveryThreshold ?? null,
      pickupEnabled: Boolean(req.body.pickupEnabled)
    };

    const settings = await VendorDeliveryConfig.findOneAndUpdate(
      { vendorId: vendor._id },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    return res.json({ success: true, data: settings });
  } catch (error) {
    return next(error);
  }
};

exports.getLogisticsQuote = async (req, res, next) => {
  try {
    const result = await calculateDeliveryFee({
      customerAddress: req.body.address || {},
      cartItems: req.body.cartItems || []
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
};

exports.createPickupPoint = async (req, res, next) => {
  try {
    const point = toPoint(req.body.location || {});
    if (!point) return res.status(400).json({ success: false, message: 'Valid location lat/lng is required' });

    let vendorId = null;
    if (String(req.user.role) === 'vendor') {
      const vendor = await Vendor.findOne({ user: req.user.id }).select('_id');
      if (!vendor) return res.status(404).json({ success: false, message: 'Vendor profile not found' });
      vendorId = vendor._id;
    }

    const payload = {
      name: req.body.name,
      vendorId,
      address: req.body.address,
      location: point,
      instructions: req.body.instructions || '',
      businessHours: req.body.businessHours || null,
      isActive: req.body.isActive !== false
    };

    const pickupPoint = await PickupPoint.create(payload);
    if (String(req.user.role) === 'admin') {
      await logAudit({
        actorAdminId: req.user.id,
        actionType: 'SYSTEM_ALERT_CREATED',
        targetType: 'SYSTEM',
        targetId: null,
        metadata: { module: 'LOGISTICS', action: 'PICKUP_POINT_CREATE', pickupPointId: pickupPoint._id },
        ipAddress: resolveIp(req),
        userAgent: req.headers['user-agent'] || ''
      });
    }
    return res.status(201).json({ success: true, data: pickupPoint });
  } catch (error) {
    return next(error);
  }
};

exports.updatePickupPoint = async (req, res, next) => {
  try {
    const query = { _id: req.params.id };
    if (String(req.user.role) === 'vendor') {
      const vendor = await Vendor.findOne({ user: req.user.id }).select('_id');
      if (!vendor) return res.status(404).json({ success: false, message: 'Vendor profile not found' });
      query.vendorId = vendor._id;
    } else if (String(req.user.role) === 'admin') {
      query.vendorId = null;
    }

    const update = { ...req.body };
    if (update.location) {
      const point = toPoint(update.location);
      if (!point) return res.status(400).json({ success: false, message: 'Valid location lat/lng is required' });
      update.location = point;
    }

    const pickupPoint = await PickupPoint.findOneAndUpdate(query, update, { new: true, runValidators: true });
    if (!pickupPoint) return res.status(404).json({ success: false, message: 'Pickup point not found' });

    if (String(req.user.role) === 'admin') {
      await logAudit({
        actorAdminId: req.user.id,
        actionType: 'SYSTEM_ALERT_CREATED',
        targetType: 'SYSTEM',
        targetId: null,
        metadata: { module: 'LOGISTICS', action: 'PICKUP_POINT_UPDATE', pickupPointId: pickupPoint._id },
        ipAddress: resolveIp(req),
        userAgent: req.headers['user-agent'] || ''
      });
    }

    return res.json({ success: true, data: pickupPoint });
  } catch (error) {
    return next(error);
  }
};

exports.deletePickupPoint = async (req, res, next) => {
  try {
    const query = { _id: req.params.id };
    if (String(req.user.role) === 'vendor') {
      const vendor = await Vendor.findOne({ user: req.user.id }).select('_id');
      if (!vendor) return res.status(404).json({ success: false, message: 'Vendor profile not found' });
      query.vendorId = vendor._id;
    } else if (String(req.user.role) === 'admin') {
      query.vendorId = null;
    }

    const pickupPoint = await PickupPoint.findOneAndDelete(query);
    if (!pickupPoint) return res.status(404).json({ success: false, message: 'Pickup point not found' });
    if (String(req.user.role) === 'admin') {
      await logAudit({
        actorAdminId: req.user.id,
        actionType: 'SYSTEM_ALERT_CREATED',
        targetType: 'SYSTEM',
        targetId: null,
        metadata: { module: 'LOGISTICS', action: 'PICKUP_POINT_DELETE', pickupPointId: pickupPoint._id },
        ipAddress: resolveIp(req),
        userAgent: req.headers['user-agent'] || ''
      });
    }
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
};

exports.listNearbyPickupPoints = async (req, res, next) => {
  try {
    const near = String(req.query.near || '');
    const [lat, lng] = near.split(',').map(Number);
    const radiusKm = Math.max(Number(req.query.radiusKm) || 25, 1);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ success: false, message: 'near query must be lat,lng' });
    }

    const points = await PickupPoint.find({
      isActive: true,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radiusKm * 1000
        }
      }
    }).limit(100);

    return res.json({ success: true, data: points });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorPickupPoints = async (req, res, next) => {
  try {
    const points = await PickupPoint.find({
      vendorId: req.params.vendorId,
      isActive: true
    }).sort({ createdAt: -1 });
    return res.json({ success: true, data: points });
  } catch (error) {
    return next(error);
  }
};

exports.listMyVendorPickupPoints = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user.id }).select('_id');
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    const points = await PickupPoint.find({ vendorId: vendor._id }).sort({ createdAt: -1 });
    return res.json({ success: true, data: points });
  } catch (error) {
    return next(error);
  }
};

exports.listAdminPickupPoints = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query, { limit: 20, maxLimit: 100 });
    const query = { vendorId: null };
    if (req.query.isActive === 'true') query.isActive = true;
    if (req.query.isActive === 'false') query.isActive = false;

    const [points, total] = await Promise.all([
      PickupPoint.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      PickupPoint.countDocuments(query)
    ]);

    return res.json({ success: true, ...paginatedResult({ data: points, page, limit, total }) });
  } catch (error) {
    return next(error);
  }
};
