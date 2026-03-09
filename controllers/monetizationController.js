const PlatformSettings = require('../models/PlatformSettings');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const { VendorSubscription } = require('../models/VendorSubscription');
const PromotedListing = require('../models/PromotedListing');
const FeaturedVendor = require('../models/FeaturedVendor');
const ReferralCode = require('../models/ReferralCode');
const ReferralEvent = require('../models/ReferralEvent');
const Vendor = require('../models/Vendor');
const VendorTransaction = require('../models/VendorTransaction');
const CustomerCredit = require('../models/CustomerCredit');
const Product = require('../models/Product');
const { logAudit, resolveIp } = require('../services/loggingService');
const { getPaginationParams, paginatedResult } = require('../utils/pagination');

async function writeAdminAudit(req, action, metadata = {}) {
  return logAudit({
    actorAdminId: req.user.id,
    actionType: 'SYSTEM_ALERT_CREATED',
    targetType: 'SYSTEM',
    targetId: null,
    metadata: { module: 'MONETIZATION', action, ...metadata },
    ipAddress: resolveIp(req),
    userAgent: req.headers['user-agent'] || ''
  });
}

exports.getPlatformSettings = async (req, res, next) => {
  try {
    const settings = await PlatformSettings.findOne({}).sort({ createdAt: -1 });
    return res.json({ success: true, data: settings || { defaultCommissionPercent: 10, perCategoryCommission: {}, perVendorCommission: {} } });
  } catch (error) {
    return next(error);
  }
};

exports.updatePlatformSettings = async (req, res, next) => {
  try {
    const payload = {
      defaultCommissionPercent: Number(req.body.defaultCommissionPercent ?? 10),
      perCategoryCommission: req.body.perCategoryCommission || {},
      perVendorCommission: req.body.perVendorCommission || {}
    };
    const settings = await PlatformSettings.findOneAndUpdate({}, payload, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    });
    await writeAdminAudit(req, 'PLATFORM_SETTINGS_UPDATE', { settingsId: settings._id });
    return res.json({ success: true, data: settings });
  } catch (error) {
    return next(error);
  }
};

exports.createSubscriptionPlan = async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.create(req.body);
    await writeAdminAudit(req, 'SUBSCRIPTION_PLAN_CREATE', { planId: plan._id });
    return res.status(201).json({ success: true, data: plan });
  } catch (error) {
    return next(error);
  }
};

exports.listSubscriptionPlans = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query, { limit: 20, maxLimit: 100 });
    const query = {};
    if (req.query.isActive === 'true') query.isActive = true;
    if (req.query.isActive === 'false') query.isActive = false;
    const [plans, total] = await Promise.all([
      SubscriptionPlan.find(query).sort({ priceMonthly: 1 }).skip(skip).limit(limit),
      SubscriptionPlan.countDocuments(query)
    ]);
    return res.json({ success: true, ...paginatedResult({ data: plans, page, limit, total }) });
  } catch (error) {
    return next(error);
  }
};

exports.updateSubscriptionPlan = async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
    await writeAdminAudit(req, 'SUBSCRIPTION_PLAN_UPDATE', { planId: plan._id });
    return res.json({ success: true, data: plan });
  } catch (error) {
    return next(error);
  }
};

exports.assignVendorSubscription = async (req, res, next) => {
  try {
    const payload = {
      vendorId: req.body.vendorId,
      planId: req.body.planId,
      status: req.body.status || 'ACTIVE',
      startAt: req.body.startAt || new Date(),
      endAt: req.body.endAt,
      autoRenew: req.body.autoRenew !== false
    };
    const subscription = await VendorSubscription.findOneAndUpdate(
      { vendorId: payload.vendorId },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
    await writeAdminAudit(req, 'VENDOR_SUBSCRIPTION_ASSIGN', { vendorId: payload.vendorId, subscriptionId: subscription._id });
    return res.json({ success: true, data: subscription });
  } catch (error) {
    return next(error);
  }
};

exports.createPromotedListing = async (req, res, next) => {
  try {
    const listing = await PromotedListing.create(req.body);
    await writeAdminAudit(req, 'PROMOTED_LISTING_CREATE', { listingId: listing._id });
    return res.status(201).json({ success: true, data: listing });
  } catch (error) {
    return next(error);
  }
};

exports.updatePromotedListing = async (req, res, next) => {
  try {
    const listing = await PromotedListing.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!listing) return res.status(404).json({ success: false, message: 'Promoted listing not found' });
    await writeAdminAudit(req, 'PROMOTED_LISTING_UPDATE', { listingId: listing._id });
    return res.json({ success: true, data: listing });
  } catch (error) {
    return next(error);
  }
};

exports.listActivePromotedListings = async (req, res, next) => {
  try {
    const now = new Date();
    const listings = await PromotedListing.find({
      status: 'ACTIVE',
      startAt: { $lte: now },
      endAt: { $gte: now }
    }).populate('productId', 'name price images').populate('vendorId', 'storeName logo');
    return res.json({ success: true, data: listings });
  } catch (error) {
    return next(error);
  }
};

exports.listAdminPromotedListings = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query, { limit: 20, maxLimit: 100 });
    const query = {};
    if (req.query.status) query.status = String(req.query.status).toUpperCase();
    if (req.query.placement) query.placement = String(req.query.placement).toUpperCase();

    const [listings, total] = await Promise.all([
      PromotedListing.find(query)
        .populate('productId', 'name price images')
        .populate('vendorId', 'storeName logo')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PromotedListing.countDocuments(query)
    ]);

    return res.json({ success: true, ...paginatedResult({ data: listings, page, limit, total }) });
  } catch (error) {
    return next(error);
  }
};

exports.setFeaturedVendor = async (req, res, next) => {
  try {
    const payload = {
      vendorId: req.body.vendorId,
      isFeatured: req.body.isFeatured !== false,
      featuredStartAt: req.body.featuredStartAt,
      featuredEndAt: req.body.featuredEndAt,
      sortOrder: Number(req.body.sortOrder || 0)
    };
    const record = await FeaturedVendor.findOneAndUpdate(
      { vendorId: payload.vendorId },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
    await writeAdminAudit(req, 'FEATURED_VENDOR_SET', { featuredVendorId: record._id, vendorId: payload.vendorId });
    return res.json({ success: true, data: record });
  } catch (error) {
    return next(error);
  }
};

exports.listFeaturedVendors = async (_req, res, next) => {
  try {
    const now = new Date();
    const records = await FeaturedVendor.find({
      isFeatured: true,
      featuredStartAt: { $lte: now },
      featuredEndAt: { $gte: now }
    }).sort({ sortOrder: 1 }).populate('vendorId', 'storeName logo rating category');
    return res.json({ success: true, data: records });
  } catch (error) {
    return next(error);
  }
};

exports.listAdminFeaturedVendors = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query, { limit: 20, maxLimit: 100 });
    const query = {};
    if (req.query.isFeatured === 'true') query.isFeatured = true;
    if (req.query.isFeatured === 'false') query.isFeatured = false;

    const [records, total] = await Promise.all([
      FeaturedVendor.find(query)
        .sort({ sortOrder: 1, createdAt: -1 })
        .populate('vendorId', 'storeName logo rating category')
        .skip(skip)
        .limit(limit),
      FeaturedVendor.countDocuments(query)
    ]);

    return res.json({ success: true, ...paginatedResult({ data: records, page, limit, total }) });
  } catch (error) {
    return next(error);
  }
};

exports.listReferralCodesAdmin = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query, { limit: 20, maxLimit: 100 });
    const query = {};
    if (req.query.role) query.role = String(req.query.role).toLowerCase();
    if (req.query.active === 'true') query.active = true;
    if (req.query.active === 'false') query.active = false;

    const [codes, total] = await Promise.all([
      ReferralCode.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ReferralCode.countDocuments(query)
    ]);

    return res.json({ success: true, ...paginatedResult({ data: codes, page, limit, total }) });
  } catch (error) {
    return next(error);
  }
};

exports.listVendorSubscriptionsAdmin = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query, { limit: 20, maxLimit: 100 });
    const query = {};
    if (req.query.status) query.status = String(req.query.status).toUpperCase();

    const [subscriptions, total] = await Promise.all([
      VendorSubscription.find(query)
        .populate('vendorId', 'storeName')
        .populate('planId', 'name priceMonthly')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit),
      VendorSubscription.countDocuments(query)
    ]);

    return res.json({ success: true, ...paginatedResult({ data: subscriptions, page, limit, total }) });
  } catch (error) {
    return next(error);
  }
};

exports.createReferralCode = async (req, res, next) => {
  try {
    const role = String(req.user.role);
    if (!['vendor', 'customer'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Only vendor or customer can create referral codes' });
    }

    const code = await ReferralCode.create({
      ownerUserId: req.user.id,
      code: req.body.code,
      role,
      rewardType: req.body.rewardType || 'CREDIT',
      rewardValue: Number(req.body.rewardValue || 0),
      active: req.body.active !== false
    });

    return res.status(201).json({ success: true, data: code });
  } catch (error) {
    return next(error);
  }
};

exports.trackReferralSignup = async (req, res, next) => {
  try {
    const code = String(req.body.code || '').toUpperCase().trim();
    const referredUserId = req.body.referredUserId;
    if (!code || !referredUserId) return res.status(400).json({ success: false, message: 'code and referredUserId are required' });

    const referralCode = await ReferralCode.findOne({ code, active: true });
    if (!referralCode) return res.status(404).json({ success: false, message: 'Referral code not found' });

    const event = await ReferralEvent.create({
      code,
      referredUserId,
      status: 'PENDING'
    });

    return res.status(201).json({ success: true, data: event });
  } catch (error) {
    return next(error);
  }
};

exports.attachReferralFirstOrder = async ({ userId, orderId }) => {
  if (!userId || !orderId) return null;
  const event = await ReferralEvent.findOneAndUpdate(
    { referredUserId: userId, firstOrderId: null },
    { firstOrderId: orderId },
    { sort: { createdAt: -1 }, new: true }
  );
  return event;
};

exports.listReferralEventsAdmin = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query, { limit: 20, maxLimit: 100 });
    const query = {};
    if (req.query.status) query.status = String(req.query.status).toUpperCase();

    const [events, total] = await Promise.all([
      ReferralEvent.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ReferralEvent.countDocuments(query)
    ]);

    return res.json({ success: true, ...paginatedResult({ data: events, page, limit, total }) });
  } catch (error) {
    return next(error);
  }
};

exports.approveReferralReward = async (req, res, next) => {
  try {
    const event = await ReferralEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Referral event not found' });
    const code = await ReferralCode.findOne({ code: event.code });
    if (!code) return res.status(404).json({ success: false, message: 'Referral code not found' });

    event.status = 'APPROVED';
    await event.save();

    if (code.role === 'vendor') {
      const vendor = await Vendor.findOne({ user: code.ownerUserId }).select('_id');
      if (vendor) {
        await VendorTransaction.create({
          vendorId: vendor._id,
          type: 'ADJUSTMENT',
          direction: 'CREDIT',
          amount: Number(code.rewardValue || 0),
          reference: `REFERRAL:${event._id}`,
          description: `Referral reward for code ${code.code}`,
          status: 'COMPLETED',
          metadata: { eventId: event._id, rewardType: code.rewardType }
        });
      }
    } else {
      await CustomerCredit.create({
        userId: code.ownerUserId,
        amount: Number(code.rewardValue || 0),
        reference: `REFERRAL:${event._id}`,
        description: `Referral reward for code ${code.code}`,
        source: 'REFERRAL',
        metadata: { eventId: event._id, rewardType: code.rewardType }
      });
    }

    event.status = 'REWARDED';
    await event.save();

    await writeAdminAudit(req, 'REFERRAL_REWARD_APPROVE', { referralEventId: event._id, code: event.code });
    return res.json({ success: true, data: event });
  } catch (error) {
    return next(error);
  }
};

exports.enforceVendorPlanLimits = async (req, res, next) => {
  try {
    if (String(req.user?.role) !== 'vendor') return next();
    const vendor = await Vendor.findOne({ user: req.user.id }).select('_id');
    if (!vendor) return next();

    const subscription = await VendorSubscription.findOne({ vendorId: vendor._id, status: { $in: ['ACTIVE', 'active'] } });
    if (!subscription) return next();

    const plan = await SubscriptionPlan.findById(subscription.planId).select('features isActive');
    if (!plan?.isActive) return next();

    const maxProducts = Number(plan.features?.maxProducts || 0);
    if (maxProducts > 0) {
      const publishedCount = await Product.countDocuments({ vendor: vendor._id, isActive: true, status: 'PUBLISHED' });
      if (publishedCount >= maxProducts) {
        return res.status(403).json({
          success: false,
          message: `Plan limit reached. Max published products allowed: ${maxProducts}`
        });
      }
    }

    req.vendorPlan = plan;
    return next();
  } catch (error) {
    return next(error);
  }
};
