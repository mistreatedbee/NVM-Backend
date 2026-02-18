const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const VendorDocument = require('../models/VendorDocument');
const Review = require('../models/Review');
const Dispute = require('../models/Dispute');
const Report = require('../models/Report');
const FraudRule = require('../models/FraudRule');
const FraudFlag = require('../models/FraudFlag');
const Order = require('../models/Order');
const { notifyAdmins, notifyUser } = require('./notificationService');

const DEFAULT_REQUIRED_VENDOR_DOCS = ['BUSINESS_REG', 'ID_DOC', 'PROOF_OF_ADDRESS'];
const TOP_RATED_MIN_AVG = Number(process.env.TOP_RATED_MIN_AVG || 4.5);
const TOP_RATED_MIN_COUNT = Number(process.env.TOP_RATED_MIN_COUNT || 20);
const TOP_RATED_MAX_DISPUTE_RATE = Number(process.env.TOP_RATED_MAX_DISPUTE_RATE || 0.1);
const TOP_RATED_DISPUTE_LOOKBACK_DAYS = Number(process.env.TOP_RATED_DISPUTE_LOOKBACK_DAYS || 90);
const TOP_RATED_REQUIRES_VERIFIED = String(process.env.TOP_RATED_REQUIRES_VERIFIED || 'true').toLowerCase() === 'true';
const TOP_RATED_REQUIRES_ACTIVE = String(process.env.TOP_RATED_REQUIRES_ACTIVE || 'true').toLowerCase() === 'true';
const TOP_RATED_CRON_MS = Number(process.env.TOP_RATED_CRON_MS || 24 * 60 * 60 * 1000);

function getRequiredVendorDocs() {
  const configured = String(process.env.REQUIRED_VENDOR_DOC_TYPES || '')
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_REQUIRED_VENDOR_DOCS;
}

async function computeVendorKycStatus(vendorId) {
  const requiredDocTypes = getRequiredVendorDocs();
  const approved = await VendorDocument.find({
    vendorId,
    status: 'APPROVED',
    docType: { $in: requiredDocTypes }
  }).select('docType');

  const approvedTypes = new Set(approved.map((doc) => String(doc.docType).toUpperCase()));
  const missing = requiredDocTypes.filter((docType) => !approvedTypes.has(docType));
  return {
    requiredDocTypes,
    approvedTypes: Array.from(approvedTypes),
    missing,
    complete: missing.length === 0
  };
}

async function recomputeVendorRatingAndBadge(vendorId) {
  if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) return null;
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) return null;

  const [reviewsAgg] = await Review.aggregate([
    {
      $match: {
        targetType: 'VENDOR',
        vendorId: new mongoose.Types.ObjectId(vendorId),
        status: 'APPROVED'
      }
    },
    {
      $group: {
        _id: '$vendorId',
        ratingAvg: { $avg: '$rating' },
        ratingCount: { $sum: 1 },
        oneStar: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        twoStar: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        threeStar: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        fourStar: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        fiveStar: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } }
      }
    }
  ]);

  const ratingAvg = Number((reviewsAgg?.ratingAvg || 0).toFixed(2));
  const ratingCount = Number(reviewsAgg?.ratingCount || 0);
  const ratingBreakdown = {
    1: Number(reviewsAgg?.oneStar || 0),
    2: Number(reviewsAgg?.twoStar || 0),
    3: Number(reviewsAgg?.threeStar || 0),
    4: Number(reviewsAgg?.fourStar || 0),
    5: Number(reviewsAgg?.fiveStar || 0)
  };

  const lookbackFrom = new Date(Date.now() - TOP_RATED_DISPUTE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const [disputesCount, ordersCount] = await Promise.all([
    Dispute.countDocuments({
      vendor: vendor._id,
      createdAt: { $gte: lookbackFrom },
      status: { $in: ['OPEN', 'IN_REVIEW', 'NEED_MORE_INFO', 'RESOLVED', 'CLOSED'] }
    }),
    Order.countDocuments({
      'items.vendor': vendor._id,
      createdAt: { $gte: lookbackFrom }
    })
  ]);
  const disputeRate = ordersCount > 0 ? disputesCount / ordersCount : 0;

  const verifiedOk = !TOP_RATED_REQUIRES_VERIFIED || vendor.verificationStatus === 'VERIFIED';
  const activeOk = !TOP_RATED_REQUIRES_ACTIVE || vendor.vendorStatus === 'ACTIVE';
  const qualifies =
    ratingAvg >= TOP_RATED_MIN_AVG &&
    ratingCount >= TOP_RATED_MIN_COUNT &&
    disputeRate <= TOP_RATED_MAX_DISPUTE_RATE &&
    verifiedOk &&
    activeOk;

  const previousTopRated = Boolean(vendor.topRatedBadge);
  vendor.vendorRatingAvg = ratingAvg;
  vendor.vendorRatingCount = ratingCount;
  vendor.vendorRatingBreakdown = ratingBreakdown;
  vendor.rating = ratingAvg;
  vendor.totalReviews = ratingCount;
  vendor.topRatedBadge = qualifies;
  vendor.topRatedUpdatedAt = new Date();
  if (qualifies && !vendor.topRatedSince) {
    vendor.topRatedSince = new Date();
  }
  if (!qualifies) {
    vendor.topRatedSince = null;
  }
  await vendor.save();

  if (vendor.user && previousTopRated !== qualifies) {
    try {
      const user = await require('../models/User').findById(vendor.user).select('name email role');
      if (user) {
        await notifyUser({
          user,
          type: 'VENDOR_APPROVAL',
          subType: qualifies ? 'VENDOR_TOP_RATED_GAINED' : 'VENDOR_TOP_RATED_LOST',
          title: qualifies ? 'Top Rated badge awarded' : 'Top Rated badge removed',
          message: qualifies
            ? 'Your store is now Top Rated based on recent customer feedback.'
            : 'Your store no longer meets Top Rated badge criteria.',
          linkUrl: '/vendor/dashboard',
          metadata: {
            event: qualifies ? 'vendor.top-rated.gained' : 'vendor.top-rated.lost',
            vendorId: String(vendor._id),
            ratingAvg,
            ratingCount
          }
        });
      }
    } catch (_error) {
      // Ignore notification failures for periodic sync.
    }
  }

  return vendor;
}

async function recomputeAllTopRatedBadges() {
  const vendors = await Vendor.find({}).select('_id');
  for (const vendor of vendors) {
    await recomputeVendorRatingAndBadge(vendor._id);
  }
}

async function validateVendorCanBeVerified(vendorId) {
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) return { ok: false, message: 'Vendor not found' };
  if (vendor.vendorStatus !== 'ACTIVE') {
    return { ok: false, message: 'Only ACTIVE vendors can be verified', vendor };
  }
  const kyc = await computeVendorKycStatus(vendor._id);
  if (!kyc.complete) {
    return { ok: false, message: `Required KYC docs are missing approval: ${kyc.missing.join(', ')}`, vendor, kyc };
  }
  return { ok: true, vendor, kyc };
}

function normalizeObjectId(value) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

async function createFraudFlag({
  entityType,
  entityId,
  rule,
  reason,
  severity,
  createdBy = null
}) {
  const query = {
    entityType,
    entityId,
    ruleId: rule?._id || null,
    status: 'OPEN'
  };
  const existing = await FraudFlag.findOne(query).select('_id');
  if (existing) return null;

  const payload = {
    entityType,
    entityId,
    ruleId: rule?._id || null,
    severity: severity || rule?.severity || 'MEDIUM',
    level: severity || rule?.severity || 'MEDIUM',
    reason,
    status: 'OPEN',
    createdBy
  };
  if (entityType === 'ORDER') payload.orderId = entityId;

  return FraudFlag.create(payload);
}

function valueAtPath(target, path) {
  if (!target || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((acc, key) => (acc ? acc[key] : undefined), target);
}

async function matchFraudRule(rule, context) {
  const conditions = rule.conditions || {};
  const type = String(conditions.type || '').toUpperCase();

  if (type === 'HIGH_ORDER_VALUE') {
    const threshold = Number(conditions.threshold || conditions.min || 0);
    const orderTotal = Number(context?.order?.total || 0);
    return orderTotal >= threshold
      ? { matched: true, reason: `Order total ${orderTotal} exceeded threshold ${threshold}` }
      : { matched: false };
  }

  if (type === 'TOO_MANY_ORDERS') {
    const customerId = context?.order?.customer || context?.order?.customerId;
    if (!customerId) return { matched: false };
    const maxOrders = Number(conditions.maxOrders || conditions.limit || 5);
    const windowHours = Number(conditions.windowHours || 1);
    const from = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const orderCount = await Order.countDocuments({
      $or: [{ customer: customerId }, { customerId }],
      createdAt: { $gte: from }
    });
    return orderCount > maxOrders
      ? { matched: true, reason: `Customer placed ${orderCount} orders in ${windowHours}h (limit ${maxOrders})` }
      : { matched: false };
  }

  if (type === 'MANY_REPORTS') {
    const targetType = String(conditions.targetType || context?.report?.targetType || '').toUpperCase();
    const targetId = context?.report?.targetId;
    if (!targetType || !targetId) return { matched: false };
    const maxOpenReports = Number(conditions.maxOpenReports || conditions.limit || 5);
    const windowHours = Number(conditions.windowHours || 24);
    const from = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const openReports = await Report.countDocuments({
      targetType,
      targetId,
      status: { $in: ['OPEN', 'IN_REVIEW'] },
      createdAt: { $gte: from }
    });
    return openReports > maxOpenReports
      ? { matched: true, reason: `${openReports} open reports for ${targetType} exceed ${maxOpenReports}` }
      : { matched: false };
  }

  if (type === 'CUSTOM') {
    const path = String(conditions.path || '');
    const op = String(conditions.operator || 'gte').toLowerCase();
    const expected = conditions.value;
    const actual = valueAtPath(context, path);
    if (actual === undefined) return { matched: false };

    let matched = false;
    if (op === 'eq') matched = actual === expected;
    if (op === 'gte') matched = Number(actual) >= Number(expected);
    if (op === 'lte') matched = Number(actual) <= Number(expected);
    if (op === 'includes') matched = Array.isArray(actual) && actual.includes(expected);
    return matched ? { matched: true, reason: `Custom rule matched at ${path}` } : { matched: false };
  }

  return { matched: false };
}

async function evaluateFraudRules(context = {}) {
  const activeRules = await FraudRule.find({ isActive: true }).sort({ createdAt: -1 });
  if (!activeRules.length) return [];

  const createdFlags = [];
  for (const rule of activeRules) {
    const result = await matchFraudRule(rule, context);
    if (!result?.matched) continue;

    const entityType = String(context.entityType || '').toUpperCase();
    const entityId = normalizeObjectId(context.entityId);
    if (!entityType || !entityId) continue;

    const flag = await createFraudFlag({
      entityType,
      entityId,
      rule,
      reason: result.reason || rule.description || rule.name,
      severity: rule.severity || 'MEDIUM',
      createdBy: context.createdBy || null
    });
    if (!flag) continue;

    createdFlags.push(flag);
    await notifyAdmins({
      type: 'SYSTEM',
      subType: 'FRAUD_FLAG_CREATED',
      title: 'Fraud rule matched',
      message: `${rule.name} flagged ${entityType} ${String(entityId)}.`,
      linkUrl: '/admin/fraud-monitoring',
      metadata: {
        event: 'fraud.flag.created',
        flagId: String(flag._id),
        ruleId: String(rule._id),
        entityType,
        entityId: String(entityId)
      }
    });

    if (rule.action === 'HOLD' && entityType === 'ORDER') {
      await Order.findByIdAndUpdate(entityId, {
        $set: {
          paymentStatus: 'UNDER_REVIEW',
          adminNotes: `[FRAUD_HOLD] ${rule.name}`
        }
      });
    }
  }

  return createdFlags;
}

function startTrustSafetyJobs() {
  setInterval(() => {
    recomputeAllTopRatedBadges().catch((error) => {
      console.error('[trustSafety] top-rated recompute failed', error.message);
    });
  }, TOP_RATED_CRON_MS);
}

module.exports = {
  computeVendorKycStatus,
  recomputeVendorRatingAndBadge,
  recomputeAllTopRatedBadges,
  validateVendorCanBeVerified,
  evaluateFraudRules,
  startTrustSafetyJobs
};

