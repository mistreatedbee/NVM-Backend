const AlertSubscription = require('../models/AlertSubscription');
const User = require('../models/User');
const { notifyUser } = require('./notificationService');

async function triggerPriceDropAlerts({ product, oldPrice, newPrice }) {
  if (oldPrice === undefined || newPrice === undefined || Number(newPrice) >= Number(oldPrice)) return 0;
  const subscriptions = await AlertSubscription.find({
    productId: product._id,
    type: 'PRICE_DROP',
    active: true,
    targetPrice: { $gte: Number(newPrice) }
  });

  let sent = 0;
  for (const sub of subscriptions) {
    const user = await User.findById(sub.userId).select('name email role');
    if (!user) continue;
    await notifyUser({
      user,
      type: 'SYSTEM',
      subType: 'PRICE_DROP',
      title: 'Price drop alert',
      message: `${product.title || product.name} dropped from ${oldPrice} to ${newPrice}.`,
      linkUrl: `/products/${product._id}`,
      metadata: {
        event: 'product.price-drop',
        productId: String(product._id),
        oldPrice,
        newPrice
      },
      emailTemplate: 'order_status_update',
      emailContext: {
        status: 'Price drop alert',
        orderId: product.title || product.name,
        actionLinks: [{ label: 'View product', url: `${process.env.FRONTEND_URL || ''}/product/${product._id}` }]
      }
    });
    sent += 1;
  }
  return sent;
}

async function triggerBackInStockAlerts({ product, oldStock, newStock }) {
  if (!(Number(oldStock) <= 0 && Number(newStock) > 0)) return 0;
  const subscriptions = await AlertSubscription.find({
    productId: product._id,
    type: 'BACK_IN_STOCK',
    active: true
  });

  let sent = 0;
  for (const sub of subscriptions) {
    const user = await User.findById(sub.userId).select('name email role');
    if (!user) continue;
    await notifyUser({
      user,
      type: 'SYSTEM',
      subType: 'BACK_IN_STOCK',
      title: 'Back in stock alert',
      message: `${product.title || product.name} is back in stock.`,
      linkUrl: `/products/${product._id}`,
      metadata: {
        event: 'product.back-in-stock',
        productId: String(product._id),
        stock: newStock
      },
      emailTemplate: 'order_status_update',
      emailContext: {
        status: 'Back in stock',
        orderId: product.title || product.name,
        actionLinks: [{ label: 'View product', url: `${process.env.FRONTEND_URL || ''}/product/${product._id}` }]
      }
    });
    sent += 1;
  }
  return sent;
}

module.exports = {
  triggerPriceDropAlerts,
  triggerBackInStockAlerts
};
