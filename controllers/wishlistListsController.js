const mongoose = require('mongoose');
const WishlistList = require('../models/WishlistList');
const Product = require('../models/Product');

function ensureObjectId(id, name) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error(`Invalid ${name}`);
    error.statusCode = 400;
    throw error;
  }
}

async function ensureProduct(productId) {
  ensureObjectId(productId, 'productId');
  const product = await Product.findOne({ _id: productId, status: 'PUBLISHED', isActive: true }).select('_id');
  if (!product) {
    const error = new Error('Product not available');
    error.statusCode = 404;
    throw error;
  }
}

exports.getLists = async (req, res, next) => {
  try {
    const lists = await WishlistList.find({ userId: req.user.id }).sort({ updatedAt: -1 }).lean();
    return res.status(200).json({ success: true, data: lists });
  } catch (error) {
    return next(error);
  }
};

exports.createList = async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'name is required' });

    const list = await WishlistList.create({
      userId: req.user.id,
      name,
      productIds: []
    });
    return res.status(201).json({ success: true, data: list });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'List name already exists' });
    }
    return next(error);
  }
};

exports.addProduct = async (req, res, next) => {
  try {
    await ensureProduct(req.body?.productId);
    const list = await WishlistList.findOne({ _id: req.params.listId, userId: req.user.id });
    if (!list) return res.status(404).json({ success: false, message: 'List not found' });

    list.productIds = list.productIds.filter((id) => String(id) !== String(req.body.productId));
    list.productIds.unshift(req.body.productId);
    await list.save();
    return res.status(200).json({ success: true, data: list });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    return next(error);
  }
};

exports.removeProduct = async (req, res, next) => {
  try {
    ensureObjectId(req.body?.productId, 'productId');
    const list = await WishlistList.findOne({ _id: req.params.listId, userId: req.user.id });
    if (!list) return res.status(404).json({ success: false, message: 'List not found' });

    list.productIds = list.productIds.filter((id) => String(id) !== String(req.body.productId));
    await list.save();
    return res.status(200).json({ success: true, data: list });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    return next(error);
  }
};

exports.deleteList = async (req, res, next) => {
  try {
    const removed = await WishlistList.findOneAndDelete({ _id: req.params.listId, userId: req.user.id });
    if (!removed) return res.status(404).json({ success: false, message: 'List not found' });
    return res.status(200).json({ success: true, message: 'List deleted' });
  } catch (error) {
    return next(error);
  }
};

exports.moveProduct = async (req, res, next) => {
  try {
    const { productId, fromListId, toListId } = req.body || {};
    ensureObjectId(productId, 'productId');
    ensureObjectId(fromListId, 'fromListId');
    ensureObjectId(toListId, 'toListId');
    await ensureProduct(productId);

    const [from, to] = await Promise.all([
      WishlistList.findOne({ _id: fromListId, userId: req.user.id }),
      WishlistList.findOne({ _id: toListId, userId: req.user.id })
    ]);
    if (!from || !to) return res.status(404).json({ success: false, message: 'List not found' });

    from.productIds = from.productIds.filter((id) => String(id) !== String(productId));
    to.productIds = to.productIds.filter((id) => String(id) !== String(productId));
    to.productIds.unshift(productId);
    await Promise.all([from.save(), to.save()]);

    return res.status(200).json({ success: true, data: { from, to } });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    return next(error);
  }
};
