const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const { authenticate } = require('../middleware/auth');
const { getPaginationParams, paginatedResult } = require('../utils/pagination');

function normalizeTargetType(value) {
  return String(value || '').trim().toUpperCase();
}

router.post('/', authenticate, async (req, res, next) => {
  try {
    const targetType = normalizeTargetType(req.body?.targetType);
    const targetId = req.body?.targetId;
    const reason = String(req.body?.description || req.body?.reason || '').trim();

    if (!['USER', 'VENDOR', 'PRODUCT', 'REVIEW'].includes(targetType)) {
      return res.status(400).json({ success: false, message: 'Invalid targetType' });
    }
    if (!targetId) {
      return res.status(400).json({ success: false, message: 'targetId is required' });
    }
    if (!reason) {
      return res.status(400).json({ success: false, message: 'reason is required' });
    }

    const report = await Report.create({
      reporterId: req.user.id,
      targetType,
      targetId,
      reason,
      status: 'OPEN'
    });

    return res.status(201).json({ success: true, data: report });
  } catch (error) {
    return next(error);
  }
});

router.get('/my', authenticate, async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query, { limit: 20, maxLimit: 100 });
    const query = { reporterId: req.user.id };
    if (req.query.status) query.status = String(req.query.status).toUpperCase();

    const [reports, total] = await Promise.all([
      Report.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Report.countDocuments(query)
    ]);

    return res.json({ success: true, ...paginatedResult({ data: reports, page, limit, total }) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
