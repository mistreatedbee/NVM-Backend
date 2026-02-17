const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const VendorTransaction = require('../models/VendorTransaction');

function isObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

async function resolveVendorIdForUser(userId) {
  const vendor = await Vendor.findOne({ user: userId }).select('_id');
  return vendor?._id || null;
}

function buildTxFilter(query, vendorId) {
  const filter = { vendorId };
  if (query.type) filter.type = String(query.type).toUpperCase();
  if (query.status) filter.status = String(query.status).toUpperCase();
  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {};
    if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
    if (query.dateTo) {
      const to = new Date(query.dateTo);
      to.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = to;
    }
  }
  return filter;
}

exports.getVendorTransactions = async (req, res, next) => {
  try {
    const vendorId = await resolveVendorIdForUser(req.user.id);
    if (!vendorId) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    }

    const { page, limit, skip } = parsePagination(req.query);
    const filter = buildTxFilter(req.query, vendorId);

    const [data, total] = await Promise.all([
      VendorTransaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      VendorTransaction.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data
    });
  } catch (error) {
    return next(error);
  }
};

exports.getAdminVendorTransactions = async (req, res, next) => {
  try {
    const { vendorId } = req.params;
    if (!isObjectId(vendorId)) {
      return res.status(400).json({ success: false, message: 'Invalid vendor id' });
    }
    const { page, limit, skip } = parsePagination(req.query);
    const filter = buildTxFilter(req.query, vendorId);

    const [data, total] = await Promise.all([
      VendorTransaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      VendorTransaction.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data
    });
  } catch (error) {
    return next(error);
  }
};
