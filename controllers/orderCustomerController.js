const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const ReturnRequest = require('../models/ReturnRequest');

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ userId });
  if (!cart) {
    cart = await Cart.create({ userId, items: [] });
  }
  return cart;
}

// POST /api/orders/:orderId/reorder
exports.reorder = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      $or: [{ customer: req.user.id }, { customerId: req.user.id }]
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const cart = await getOrCreateCart(req.user.id);
    let added = 0;

    for (const item of order.items || []) {
      const productId = item.productId || item.product;
      const product = await Product.findOne({ _id: productId, status: 'PUBLISHED', isActive: true }).select('_id price name title images stock trackInventory vendor');
      if (!product) continue;

      const qtyWanted = Number(item.qty || item.quantity || 1);
      const qty = product.trackInventory ? Math.min(qtyWanted, product.stock || 0) : qtyWanted;
      if (qty <= 0) continue;

      const idx = cart.items.findIndex((cartItem) => String(cartItem.productId) === String(product._id));
      if (idx >= 0) {
        cart.items[idx].qty = product.trackInventory ? Math.min(product.stock || 0, cart.items[idx].qty + qty) : cart.items[idx].qty + qty;
        cart.items[idx].priceSnapshot = product.price;
        cart.items[idx].titleSnapshot = product.title || product.name;
        cart.items[idx].imageSnapshot = product.images?.[0]?.url || '';
      } else {
        cart.items.push({
          productId: product._id,
          vendorId: product.vendor,
          qty,
          priceSnapshot: product.price,
          titleSnapshot: product.title || product.name,
          imageSnapshot: product.images?.[0]?.url || '',
          addedAt: new Date()
        });
      }
      added += 1;
    }

    await cart.save();
    return res.status(200).json({ success: true, message: 'Items copied to cart', added });
  } catch (error) {
    return next(error);
  }
};

// POST /api/orders/:orderId/returns
exports.createReturnRequest = async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, message: 'items are required' });

    const order = await Order.findOne({
      _id: req.params.orderId,
      $or: [{ customer: req.user.id }, { customerId: req.user.id }]
    }).select('_id items');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    for (const item of items) {
      const exists = (order.items || []).some((orderItem) => String(orderItem.productId || orderItem.product) === String(item.productId));
      if (!exists) return res.status(400).json({ success: false, message: `Product ${item.productId} is not in this order` });
      if (!item.qty || !item.reason) return res.status(400).json({ success: false, message: 'Each return item requires qty and reason' });
    }

    const request = await ReturnRequest.create({
      orderId: order._id,
      userId: req.user.id,
      items,
      status: 'REQUESTED'
    });
    return res.status(201).json({ success: true, data: request });
  } catch (error) {
    return next(error);
  }
};

exports.getMyReturnRequests = async (req, res, next) => {
  try {
    const data = await ReturnRequest.find({ userId: req.user.id }).sort({ createdAt: -1 }).populate('orderId', 'orderNumber status');
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};
