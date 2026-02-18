const mongoose = require('mongoose');
const Report = require('../models/Report');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Review = require('../models/Review');
const { notifyAdmins } = require('../services/notificationService');
const { evaluateFraudRules } = require('../services/trustSafetyService');
const { logActivity, resolveIp } = require('../services/loggingService');

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function parsePagination(query, defaultLimit = 20) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

async function ensureTargetExists(targetType, targetId) {
  if (targetType === 'PRODUCT') return Boolean(await Product.findById(targetId).select('_id'));
  if (targetType === 'VENDOR') return Boolean(await Vendor.findById(targetId).select('_id'));
  if (targetType === 'USER') return Boolean(await User.findById(targetId).select('_id'));
  if (targetType === 'REVIEW') return Boolean(await Review.findById(targetId).select('_id'));
  return false;
}

exports.createReport = async (req, res, next) => {
  try {
    const targetType = String(req.body?.targetType || '').toUpperCase();
    const targetId = String(req.body?.targetId || '').trim();
    const reasonCategory = String(req.body?.reasonCategory || '').toUpperCase();
    const description = String(req.body?.description || '').trim();
    const evidenceUrls = Array.isArray(req.body?.evidenceUrls)
      ? req.body.evidenceUrls.map((url) => String(url || '').trim()).filter(Boolean).slice(0, 10)
      : [];

    const allowedTargets = ['PRODUCT', 'VENDOR', 'USER', 'REVIEW'];
    const allowedReasons = ['SPAM', 'SCAM', 'PROHIBITED_ITEM', 'HARASSMENT', 'FAKE_PRODUCT', 'INFRINGEMENT', 'OTHER'];
    if (!allowedTargets.includes(targetType) || !isObjectId(targetId)) {
      return res.status(400).json({ success: false, message: 'Invalid targetType/targetId' });
    }
    if (!allowedReasons.includes(reasonCategory)) {
      return res.status(400).json({ success: false, message: 'Invalid reasonCategory' });
    }
    const exists = await ensureTargetExists(targetType, targetId);
    if (!exists) return res.status(404).json({ success: false, message: 'Report target not found' });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const reportCountToday = await Report.countDocuments({
      reporterId: req.user.id,
      createdAt: { $gte: startOfDay }
    });
    if (reportCountToday >= 5) {
      return res.status(429).json({ success: false, message: 'Daily report limit reached (5/day)' });
    }

    const report = await Report.create({
      reporterId: req.user.id,
      targetType,
      targetId,
      reasonCategory,
      reason: reasonCategory,
      description,
      evidenceUrls,
      status: 'OPEN'
    });

    await logActivity({
      userId: req.user.id,
      role: req.user.role,
      action: 'REPORT_CREATED',
      entityType: 'REPORT',
      entityId: report._id,
      metadata: { targetType, targetId },
      ipAddress: resolveIp(req),
      userAgent: req.headers['user-agent'] || ''
    });

    await notifyAdmins({
      type: 'SYSTEM',
      subType: 'NEW_REPORT',
      title: 'New trust & safety report',
      message: `${targetType} was reported for ${reasonCategory}.`,
      linkUrl: `/admin/reports/${report._id}`,
      metadata: {
        event: 'report.created',
        reportId: String(report._id),
        targetType,
        targetId
      }
    });

    await evaluateFraudRules({
      entityType: targetType === 'VENDOR' ? 'VENDOR' : targetType === 'PRODUCT' ? 'PRODUCT' : targetType === 'USER' ? 'USER' : null,
      entityId: targetType === 'REVIEW' ? null : targetId,
      createdBy: req.user.id,
      report
    });

    return res.status(201).json({ success: true, data: report });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: 'You already reported this target' });
    }
    return next(error);
  }
};

exports.getMyReports = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const [data, total] = await Promise.all([
      Report.find({ reporterId: req.user.id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Report.countDocuments({ reporterId: req.user.id })
    ]);
    return res.status(200).json({
      success: true,
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    return next(error);
  }
};

