const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Product = require('../models/Product');

const MAX_QTY = 99;

function ensureProductId(productId) {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    const error = new Error('Invalid productId');
    error.statusCode = 400;
    throw error;
  }
}

function normalizeQty(value) {
  const qty = parseInt(value, 10);
  if (Number.isNaN(qty) || qty < 1 || qty > MAX_QTY) {
    const error = new Error(`qty must be between 1 and ${MAX_QTY}`);
    error.statusCode = 400;
    throw error;
  }
  return qty;
}

function resolveCartOwner(req) {
  if (req.user?.id) {
    return { userId: req.user.id, sessionId: null };
  }

  const sessionId = String(req.headers['x-session-id'] || req.query.sessionId || req.body?.sessionId || '').trim();
  if (!sessionId) {
    const error = new Error('sessionId is required for guest cart operations');
    error.statusCode = 400;
    throw error;
  }

  return { userId: null, sessionId };
}

async function ensurePurchasableProduct(productId) {
  ensureProductId(productId);

  const product = await Product.findOne({ _id: productId, status: 'PUBLISHED', isActive: true })
    .select('_id name title images price stock trackInventory vendor status isActive')
    .lean();

  if (!product) {
    const error = new Error('Product not available');
    error.statusCode = 404;
    throw error;
  }

  return product;
}

function mapProductSummary(product) {
  return {
    id: product._id,
    name: product.title || product.name,
    price: product.price,
    image: product.images?.[0]?.url || '',
    stock: product.stock,
    trackInventory: product.trackInventory,
    status: product.status,
    isActive: product.isActive,
    vendorId: product.vendor
  };
}

async function getOrCreateCartByOwner({ userId = null, sessionId = null }) {
  const query = userId ? { userId } : { sessionId };
  let cart = await Cart.findOne(query);
  if (!cart) {
    cart = await Cart.create({
      userId: userId || null,
      sessionId: userId ? null : sessionId,
      items: []
    });
  }
  return cart;
}

async function buildCartResponse(owner) {
  const cart = await getOrCreateCartByOwner(owner);
  const productIds = cart.items.map((item) => item.productId);

  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } })
      .select('_id name title images price stock trackInventory status isActive vendor')
      .lean()
    : [];

  const productMap = new Map(products.map((product) => [String(product._id), product]));

  const items = cart.items.map((item) => {
    const product = productMap.get(String(item.productId));
    return {
      productId: item.productId,
      vendorId: item.vendorId,
      qty: item.qty,
      priceSnapshot: item.priceSnapshot,
      titleSnapshot: item.titleSnapshot,
      imageSnapshot: item.imageSnapshot,
      addedAt: item.addedAt,
      product: product ? mapProductSummary(product) : null,
      availability: product
        ? {
            canPurchase: product.status === 'PUBLISHED' && product.isActive && (!product.trackInventory || product.stock > 0),
            stock: product.stock,
            trackInventory: product.trackInventory,
            currentPrice: product.price,
            productName: product.title || product.name
          }
        : {
            canPurchase: false,
            stock: 0,
            trackInventory: false,
            currentPrice: null,
            productName: item.titleSnapshot
          }
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.priceSnapshot * item.qty, 0);
  const itemCount = items.reduce((sum, item) => sum + item.qty, 0);

  return {
    success: true,
    data: {
      id: cart._id,
      userId: cart.userId,
      sessionId: cart.sessionId || null,
      couponCode: cart.couponCode || '',
      itemCount,
      subtotal,
      items,
      updatedAt: cart.updatedAt,
      createdAt: cart.createdAt
    }
  };
}

exports.getCart = async (req, res, next) => {
  try {
    const owner = resolveCartOwner(req);
    const payload = await buildCartResponse(owner);
    return res.status(200).json(payload);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

exports.addCartItem = async (req, res, next) => {
  try {
    const owner = resolveCartOwner(req);
    const { productId, qty } = req.body || {};
    if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });

    const safeQty = normalizeQty(qty || 1);
    const product = await ensurePurchasableProduct(productId);

    if (product.trackInventory && product.stock < 1) {
      return res.status(400).json({ success: false, message: 'Product is out of stock' });
    }

    const cart = await getOrCreateCartByOwner(owner);
    const idx = cart.items.findIndex((item) => String(item.productId) === String(productId));

    if (idx >= 0) {
      const nextQty = Math.min(MAX_QTY, cart.items[idx].qty + safeQty);
      if (product.trackInventory && nextQty > product.stock) {
        return res.status(400).json({ success: false, message: `Only ${product.stock} item(s) available in stock` });
      }
      cart.items[idx].qty = nextQty;
      cart.items[idx].priceSnapshot = product.price;
      cart.items[idx].titleSnapshot = product.title || product.name;
      cart.items[idx].imageSnapshot = product.images?.[0]?.url || '';
      cart.items[idx].addedAt = new Date();
    } else {
      if (product.trackInventory && safeQty > product.stock) {
        return res.status(400).json({ success: false, message: `Only ${product.stock} item(s) available in stock` });
      }
      cart.items.push({
        productId: product._id,
        vendorId: product.vendor,
        qty: safeQty,
        priceSnapshot: product.price,
        titleSnapshot: product.title || product.name,
        imageSnapshot: product.images?.[0]?.url || '',
        addedAt: new Date()
      });
    }

    await cart.save();
    const payload = await buildCartResponse(owner);
    return res.status(200).json(payload);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

exports.updateCartItem = async (req, res, next) => {
  try {
    const owner = resolveCartOwner(req);
    const { productId, qty } = req.body || {};
    if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });

    const safeQty = normalizeQty(qty);
    const product = await ensurePurchasableProduct(productId);

    if (product.trackInventory && safeQty > product.stock) {
      return res.status(400).json({ success: false, message: `Only ${product.stock} item(s) available in stock` });
    }

    const cart = await getOrCreateCartByOwner(owner);
    const idx = cart.items.findIndex((item) => String(item.productId) === String(productId));

    if (idx < 0) {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }

    cart.items[idx].qty = safeQty;
    cart.items[idx].priceSnapshot = product.price;
    cart.items[idx].titleSnapshot = product.title || product.name;
    cart.items[idx].imageSnapshot = product.images?.[0]?.url || '';
    await cart.save();

    const payload = await buildCartResponse(owner);
    return res.status(200).json(payload);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

exports.removeCartItem = async (req, res, next) => {
  try {
    const owner = resolveCartOwner(req);
    const { productId } = req.body || {};
    if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });
    ensureProductId(productId);

    const cart = await getOrCreateCartByOwner(owner);
    cart.items = cart.items.filter((item) => String(item.productId) !== String(productId));
    await cart.save();

    const payload = await buildCartResponse(owner);
    return res.status(200).json(payload);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

exports.clearCart = async (req, res, next) => {
  try {
    const owner = resolveCartOwner(req);
    const cart = await getOrCreateCartByOwner(owner);
    cart.items = [];
    cart.couponCode = '';
    await cart.save();

    const payload = await buildCartResponse(owner);
    return res.status(200).json(payload);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

exports.mergeCart = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Authentication required for merge' });
    }

    const guestItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!guestItems.length) {
      const payload = await buildCartResponse({ userId: req.user.id, sessionId: null });
      return res.status(200).json(payload);
    }

    const cart = await getOrCreateCartByOwner({ userId: req.user.id, sessionId: null });

    for (const guestItem of guestItems) {
      const productId = guestItem.productId;
      const qty = guestItem.quantity || guestItem.qty || 1;
      if (!mongoose.Types.ObjectId.isValid(productId)) continue;

      const safeQty = Math.max(1, Math.min(MAX_QTY, parseInt(qty, 10) || 1));
      const product = await Product.findOne({ _id: productId, status: 'PUBLISHED', isActive: true })
        .select('_id name title images price stock trackInventory vendor')
        .lean();

      if (!product) continue;
      if (product.trackInventory && product.stock <= 0) continue;

      const idx = cart.items.findIndex((item) => String(item.productId) === String(productId));
      const mergedQty = idx >= 0 ? cart.items[idx].qty + safeQty : safeQty;
      const cappedQty = product.trackInventory ? Math.min(mergedQty, product.stock) : Math.min(mergedQty, MAX_QTY);

      if (idx >= 0) {
        cart.items[idx].qty = cappedQty;
        cart.items[idx].priceSnapshot = product.price;
        cart.items[idx].titleSnapshot = product.title || product.name;
        cart.items[idx].imageSnapshot = product.images?.[0]?.url || '';
      } else {
        cart.items.push({
          productId: product._id,
          vendorId: product.vendor,
          qty: cappedQty,
          priceSnapshot: product.price,
          titleSnapshot: product.title || product.name,
          imageSnapshot: product.images?.[0]?.url || '',
          addedAt: new Date()
        });
      }
    }

    await cart.save();
    const payload = await buildCartResponse({ userId: req.user.id, sessionId: null });
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
};
