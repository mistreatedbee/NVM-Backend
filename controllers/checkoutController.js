const PromoCode = require('../models/PromoCode');
const GiftCard = require('../models/GiftCard');
const Cart = require('../models/Cart');
const { calculateDeliveryFee } = require('../services/logisticsService');
const { calculateOrderTotals } = require('../services/orderPricingService');

function calculateDiscount(subtotal, promo) {
  if (!promo) return 0;
  if (promo.discountType === 'PERCENT') {
    return Math.max(0, Math.min(subtotal, (subtotal * promo.amount) / 100));
  }
  return Math.max(0, Math.min(subtotal, promo.amount));
}

exports.applyPromoCode = async (req, res, next) => {
  try {
    const subtotal = Number(req.body?.subtotal || 0);
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ success: false, message: 'code is required' });
    if (subtotal <= 0) return res.status(400).json({ success: false, message: 'subtotal must be greater than 0' });

    const promo = await PromoCode.findOne({ code, active: true });
    if (!promo) return res.status(404).json({ success: false, message: 'Promo code not found' });
    if (promo.expiresAt && promo.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'Promo code expired' });
    }
    if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) {
      return res.status(400).json({ success: false, message: 'Promo code usage limit reached' });
    }
    if (subtotal < (promo.minSpend || 0)) {
      return res.status(400).json({ success: false, message: `Minimum spend is ${promo.minSpend}` });
    }

    const discount = Number(calculateDiscount(subtotal, promo).toFixed(2));
    return res.status(200).json({
      success: true,
      data: {
        code: promo.code,
        discountType: promo.discountType,
        amount: promo.amount,
        discount
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.redeemGiftCard = async (req, res, next) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const total = Number(req.body?.total || 0);
    if (!code) return res.status(400).json({ success: false, message: 'code is required' });
    if (total <= 0) return res.status(400).json({ success: false, message: 'total must be greater than 0' });

    const card = await GiftCard.findOne({ code, active: true });
    if (!card) return res.status(404).json({ success: false, message: 'Gift card not found' });
    if (card.expiresAt && card.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'Gift card expired' });
    }
    if (card.balance <= 0) {
      return res.status(400).json({ success: false, message: 'Gift card has no balance' });
    }

    const applied = Math.min(card.balance, total);
    return res.status(200).json({
      success: true,
      data: {
        code: card.code,
        balance: card.balance,
        applied,
        remaining: Number((card.balance - applied).toFixed(2))
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.getCheckoutPreview = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required for checkout preview' });
    }

    const {
      address,
      deliveryMethod: rawDeliveryMethod,
      discount: rawDiscount
    } = req.body || {};

    const cart = await Cart.findOne({ userId }).lean();
    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Your cart is empty' });
    }

    const normalizedItems = cart.items.map((item) => ({
      productId: item.productId,
      quantity: item.qty,
      price: item.priceSnapshot
    }));

    const subtotal = normalizedItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );

    const deliveryMethod =
      String(rawDeliveryMethod || 'DELIVERY').toUpperCase() === 'PICKUP' ? 'PICKUP' : 'DELIVERY';

    let shippingCost = 0;
    let quote = { options: [], breakdown: [] };

    if (deliveryMethod === 'DELIVERY') {
      quote = await calculateDeliveryFee({
        customerAddress: address || {},
        cartItems: normalizedItems
      });

      const deliveryOption = Array.isArray(quote?.options)
        ? quote.options.find((option) => option.method === 'DELIVERY')
        : null;

      if (!deliveryOption) {
        return res.status(400).json({
          success: false,
          message:
            quote?.message ||
            'We could not calculate a delivery fee for this address. Please update your address or choose collection where available.'
        });
      }

      shippingCost = Number(deliveryOption.fee || 0);
    } else {
      shippingCost = 0;
    }

    const discount = Math.max(0, Number(rawDiscount || 0));
    const pricing = calculateOrderTotals({
      subtotal,
      deliveryFee: shippingCost,
      discount
    });

    return res.status(200).json({
      success: true,
      data: {
        items: normalizedItems,
        subtotal: pricing.totals.subtotal,
        deliveryMethod,
        deliveryFee: pricing.totals.delivery,
        discount: pricing.totals.discount,
        tax: pricing.tax,
        total: pricing.total,
        totals: pricing.totals,
        deliveryOptions: quote.options || [],
        deliveryBreakdown: quote.breakdown || []
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.consumeGiftCard = async ({ code, amount }) => {
  if (!code || !amount || amount <= 0) return null;
  const card = await GiftCard.findOne({ code: String(code).trim().toUpperCase(), active: true });
  if (!card || card.balance < amount) return null;
  card.balance = Number((card.balance - amount).toFixed(2));
  if (card.balance <= 0) card.active = false;
  await card.save();
  return card;
};

exports.consumePromoCode = async ({ code }) => {
  if (!code) return null;
  const promo = await PromoCode.findOne({ code: String(code).trim().toUpperCase(), active: true });
  if (!promo) return null;
  promo.usedCount += 1;
  await promo.save();
  return promo;
};
