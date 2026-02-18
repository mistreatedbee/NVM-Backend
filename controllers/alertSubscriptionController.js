const mongoose = require('mongoose');
const AlertSubscription = require('../models/AlertSubscription');
const Product = require('../models/Product');

function ensureId(id, field) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error(`Invalid ${field}`);
    error.statusCode = 400;
    throw error;
  }
}

async function ensureProduct(productId) {
  ensureId(productId, 'productId');
  const product = await Product.findOne({ _id: productId, status: 'PUBLISHED', isActive: true }).select('_id price stock');
  if (!product) {
    const error = new Error('Product not available');
    error.statusCode = 404;
    throw error;
  }
  return product;
}

exports.listAlerts = async (req, res, next) => {
  try {
    const data = await AlertSubscription.find({ userId: req.user.id }).sort({ createdAt: -1 }).populate('productId', 'name title slug price stock images');
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

exports.createAlert = async (req, res, next) => {
  try {
    const { productId, type, targetPrice } = req.body || {};
    await ensureProduct(productId);

    if (!['PRICE_DROP', 'BACK_IN_STOCK'].includes(type)) {
      return res.status(400).json({ success: false, message: 'type must be PRICE_DROP or BACK_IN_STOCK' });
    }
    if (type === 'PRICE_DROP' && (targetPrice === undefined || Number.isNaN(Number(targetPrice)))) {
      return res.status(400).json({ success: false, message: 'targetPrice is required for PRICE_DROP alerts' });
    }

    const data = await AlertSubscription.findOneAndUpdate(
      { userId: req.user.id, productId, type },
      { userId: req.user.id, productId, type, targetPrice: type === 'PRICE_DROP' ? Number(targetPrice) : undefined, active: true },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    return next(error);
  }
};

exports.deactivateAlert = async (req, res, next) => {
  try {
    ensureId(req.params.id, 'id');
    const data = await AlertSubscription.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { active: false },
      { new: true }
    );
    if (!data) return res.status(404).json({ success: false, message: 'Alert not found' });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    return next(error);
  }
};
