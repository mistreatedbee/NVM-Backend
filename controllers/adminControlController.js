const ActivityLog = require('../models/ActivityLog');
const ComplianceFlag = require('../models/ComplianceFlag');
const Vendor = require('../models/Vendor');
const VendorDocument = require('../models/VendorDocument');
const User = require('../models/User');
const Product = require('../models/Product');
const Review = require('../models/Review');
const AuditLog = require('../models/AuditLog');
const { logAudit, resolveIp } = require('../services/loggingService');
const { getPaginationParams, paginatedResult } = require('../utils/pagination');

function parsePagination(query, defaultLimit = 20) {
  return getPaginationParams(query, { limit: defaultLimit, maxLimit: 100 });
}

function parseDateRange(query) {
  const dateQuery = {};
  if (query.dateFrom || query.dateTo) {
    dateQuery.createdAt = {};
    if (query.dateFrom) {
      const from = new Date(query.dateFrom);
      if (!Number.isNaN(from.getTime())) dateQuery.createdAt.$gte = from;
    }
    if (query.dateTo) {
      const to = new Date(query.dateTo);
      if (!Number.isNaN(to.getTime())) dateQuery.createdAt.$lte = to;
    }
    if (!Object.keys(dateQuery.createdAt).length) delete dateQuery.createdAt;
  }
  return dateQuery;
}

exports.getAdminActivity = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = { ...parseDateRange(req.query) };

    if (req.query.action) query.action = req.query.action;
    if (req.query.role) query.role = req.query.role;
    if (req.query.userId) query.userId = req.query.userId;

    if (req.query.q) {
      const q = String(req.query.q).trim();
      const users = await User.find({
        $or: [{ email: { $regex: q, $options: 'i' } }, { name: { $regex: q, $options: 'i' } }]
      }).select('_id');
      const userIds = users.map((user) => user._id);
      query.$or = [
        { userId: { $in: userIds } },
        { 'metadata.orderNumber': { $regex: q, $options: 'i' } },
        { 'metadata.productTitle': { $regex: q, $options: 'i' } }
      ];
    }

    const [items, total] = await Promise.all([
      ActivityLog.find(query)
        .populate('userId', 'name email role isActive isBanned')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      ...paginatedResult({ data: items, page, limit, total })
    });
  } catch (error) {
    return next(error);
  }
};

exports.getAdminUsersList = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};

    if (req.query.role) query.role = req.query.role;
    if (req.query.status === 'active') {
      query.isBanned = false;
      query.isActive = true;
    }
    if (req.query.status === 'suspended' || req.query.status === 'banned') {
      query.$or = [{ isBanned: true }, { isActive: false }];
    }
    if (req.query.q) {
      const q = String(req.query.q).trim();
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } }
        ]
      });
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('name email role isVerified isActive isBanned createdAt updatedAt lastLogin')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      ...paginatedResult({ data: users, page, limit, total })
    });
  } catch (error) {
    return next(error);
  }
};

exports.getAdminUserActivity = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = { userId: req.params.userId };

    const [items, total] = await Promise.all([
      ActivityLog.find(query)
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      ...paginatedResult({ data: items, page, limit, total })
    });
  } catch (error) {
    return next(error);
  }
};

exports.getVendorsCompliance = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const vendorQuery = {};

    if (req.query.q) {
      const q = String(req.query.q).trim();
      vendorQuery.$or = [
        { storeName: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } }
      ];
    }

    if (req.query.vendorStatus) {
      vendorQuery.vendorStatus = req.query.vendorStatus;
    }

    const [vendors, total] = await Promise.all([
      Vendor.find(vendorQuery)
        .select('_id user storeName email phone vendorStatus verificationStatus createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Vendor.countDocuments(vendorQuery)
    ]);

    const vendorIds = vendors.map((vendor) => vendor._id);

    const [docsAgg, flagsAgg, flagsList, reviewAgg, productAgg] = await Promise.all([
      VendorDocument.aggregate([
        { $match: { vendorId: { $in: vendorIds } } },
        { $group: { _id: { vendorId: '$vendorId', status: '$status' }, count: { $sum: 1 } } }
      ]),
      ComplianceFlag.aggregate([
        { $match: { vendorId: { $in: vendorIds } } },
        { $group: { _id: { vendorId: '$vendorId', status: '$status', severity: '$severity' }, count: { $sum: 1 } } }
      ]),
      ComplianceFlag.find({ vendorId: { $in: vendorIds }, status: 'OPEN' })
        .select('_id vendorId type severity note createdAt')
        .sort({ createdAt: -1 })
        .lean(),
      Review.aggregate([
        { $match: { vendorId: { $in: vendorIds }, reportedCount: { $gt: 0 } } },
        { $group: { _id: '$vendorId', reportedReviews: { $sum: '$reportedCount' } } }
      ]),
      Product.aggregate([
        { $match: { vendor: { $in: vendorIds }, reportCount: { $gt: 0 } } },
        { $group: { _id: '$vendor', reportedProducts: { $sum: '$reportCount' } } }
      ])
    ]);

    const docsMap = new Map();
    for (const row of docsAgg) {
      const key = String(row._id.vendorId);
      const bucket = docsMap.get(key) || { APPROVED: 0, REJECTED: 0, UPLOADED: 0 };
      bucket[row._id.status] = row.count;
      docsMap.set(key, bucket);
    }

    const flagsMap = new Map();
    for (const row of flagsAgg) {
      const key = String(row._id.vendorId);
      const bucket = flagsMap.get(key) || { openCount: 0, resolvedCount: 0, highestSeverity: 'LOW' };
      if (row._id.status === 'OPEN') bucket.openCount += row.count;
      if (row._id.status === 'RESOLVED') bucket.resolvedCount += row.count;
      if (row._id.status === 'OPEN') {
        if (row._id.severity === 'HIGH') bucket.highestSeverity = 'HIGH';
        else if (row._id.severity === 'MEDIUM' && bucket.highestSeverity !== 'HIGH') bucket.highestSeverity = 'MEDIUM';
      }
      flagsMap.set(key, bucket);
    }

    const reviewMap = new Map(reviewAgg.map((row) => [String(row._id), row.reportedReviews]));
    const productMap = new Map(productAgg.map((row) => [String(row._id), row.reportedProducts]));
    const flagsListMap = new Map();
    for (const flag of flagsList) {
      const key = String(flag.vendorId);
      const bucket = flagsListMap.get(key) || [];
      bucket.push(flag);
      flagsListMap.set(key, bucket);
    }

    let data = vendors.map((vendor) => {
      const id = String(vendor._id);
      return {
        vendor,
        docs: docsMap.get(id) || { APPROVED: 0, REJECTED: 0, UPLOADED: 0 },
        flags: flagsMap.get(id) || { openCount: 0, resolvedCount: 0, highestSeverity: 'LOW' },
        openFlags: flagsListMap.get(id) || [],
        reportedReviews: reviewMap.get(id) || 0,
        reportedProducts: productMap.get(id) || 0
      };
    });

    const legacyStatus = String(req.query.status || '').trim().toUpperCase();
    if (legacyStatus) {
      data = data.filter((row) => row.vendor.vendorStatus === legacyStatus);
    }
    if (req.query.flagStatus === 'OPEN') {
      data = data.filter((row) => row.flags.openCount > 0);
    }
    if (req.query.flagStatus === 'RESOLVED') {
      data = data.filter((row) => row.flags.resolvedCount > 0);
    }
    if (req.query.severity) {
      data = data.filter((row) => row.flags.highestSeverity === req.query.severity);
    }

    return res.status(200).json({
      success: true,
      ...paginatedResult({ data, page, limit, total })
    });
  } catch (error) {
    return next(error);
  }
};

exports.createComplianceFlag = async (req, res, next) => {
  try {
    const { type, severity, note } = req.body || {};
    if (!type || !severity) {
      return res.status(400).json({ success: false, message: 'type and severity are required' });
    }

    const vendor = await Vendor.findById(req.params.vendorId).select('_id storeName vendorStatus');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const flag = await ComplianceFlag.create({
      vendorId: vendor._id,
      type,
      severity,
      note: note || '',
      createdBy: req.user.id,
      status: 'OPEN'
    });

    await logAudit({
      actorAdminId: req.user.id,
      actionType: 'VENDOR_COMPLIANCE_REVIEW',
      targetType: 'VENDOR',
      targetId: vendor._id,
      reason: note || `${type} (${severity})`,
      metadata: {
        flagId: flag._id.toString(),
        type,
        severity,
        vendorStatus: vendor.vendorStatus
      },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
    });

    return res.status(201).json({ success: true, data: flag });
  } catch (error) {
    return next(error);
  }
};

exports.resolveComplianceFlag = async (req, res, next) => {
  try {
    const flag = await ComplianceFlag.findById(req.params.flagId);
    if (!flag) {
      return res.status(404).json({ success: false, message: 'Compliance flag not found' });
    }

    flag.status = 'RESOLVED';
    flag.resolvedBy = req.user.id;
    flag.resolvedAt = new Date();
    if (req.body?.note) {
      flag.note = String(req.body.note);
    }
    await flag.save();

    await logAudit({
      actorAdminId: req.user.id,
      actionType: 'VENDOR_COMPLIANCE_REVIEW',
      targetType: 'VENDOR',
      targetId: flag.vendorId,
      reason: req.body?.note || 'Compliance flag resolved',
      metadata: {
        flagId: flag._id.toString(),
        status: flag.status,
        resolvedAt: flag.resolvedAt
      },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
    });

    return res.status(200).json({ success: true, data: flag });
  } catch (error) {
    return next(error);
  }
};

exports.getAdminAuditLogs = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = { ...parseDateRange(req.query) };

    if (req.query.targetType) query.targetType = req.query.targetType;
    if (req.query.targetId) query.targetId = req.query.targetId;
    if (req.query.vendorId) {
      query.$or = [
        { targetType: 'VENDOR', targetId: req.query.vendorId },
        { targetVendorId: req.query.vendorId }
      ];
    }
    if (req.query.actionType) query.actionType = req.query.actionType;
    if (req.query.actorAdminId) query.actorAdminId = req.query.actorAdminId;

    const [items, total] = await Promise.all([
      AuditLog.find(query)
        .populate('actorAdminId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      ...paginatedResult({ data: items, page, limit, total })
    });
  } catch (error) {
    return next(error);
  }
};
