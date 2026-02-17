const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { notifyUser } = require('../services/notificationService');
const { buildAppUrl } = require('../utils/appUrl');
const { issueInvoicesForOrder } = require('../services/invoiceService');

// @desc    Create payment intent (Stripe)
// @route   POST /api/payments/create-intent
// @access  Private
exports.createPaymentIntent = async (req, res, next) => {
  try {
    const { amount, orderId } = req.body;

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        orderId,
        customerId: req.user.id.toString()
      }
    });

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Confirm payment
// @route   POST /api/payments/confirm
// @access  Private
exports.confirmPayment = async (req, res, next) => {
  try {
    const { paymentIntentId, orderId } = req.body;

    // Retrieve payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      // Update order
      const order = await Order.findById(orderId);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      order.paymentStatus = 'paid';
      order.paymentId = paymentIntentId;
      order.paidAt = Date.now();
      order.status = 'confirmed';
      order.confirmedAt = Date.now();
      await order.save();
      await issueInvoicesForOrder({ orderId: order._id, actorId: req.user.id });

      const customer = await User.findById(order.customer).select('name email role');
      if (customer) {
        await notifyUser({
          user: customer,
          type: 'ORDER',
          title: 'Payment successful',
          message: `Payment for order ${order.orderNumber} was successful.`,
          linkUrl: `/orders/${order._id}/track`,
          metadata: { event: 'order.payment-success', orderId: order._id.toString() },
          emailTemplate: 'order_status_update',
          emailContext: {
            orderId: order.orderNumber,
            status: 'confirmed',
            actionLinks: [{ label: 'Track order', url: buildAppUrl(`/orders/${order._id}/track`) }]
          }
        });
      }

      // Create transactions for each vendor
      const vendorTransactions = {};
      
      for (const item of order.items) {
        const vendorId = item.vendor.toString();
        
        if (!vendorTransactions[vendorId]) {
          vendorTransactions[vendorId] = {
            vendor: vendorId,
            amount: 0
          };
        }
        
        vendorTransactions[vendorId].amount += item.subtotal;
      }

      // Create transaction records
      for (const [vendorId, data] of Object.entries(vendorTransactions)) {
        const platformFee = data.amount * 0.10; // 10% platform fee
        const vendorAmount = data.amount - platformFee;

        await Transaction.create({
          order: order._id,
          vendor: vendorId,
          customer: order.customer,
          type: 'payment',
          amount: data.amount,
          platformFee,
          paymentFee: 0,
          vendorAmount,
          paymentMethod: 'stripe',
          paymentId: paymentIntentId,
          paymentStatus: 'completed',
          status: 'completed',
          completedAt: Date.now()
        });
      }

      res.status(200).json({
        success: true,
        message: 'Payment confirmed',
        data: order
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Payment not completed'
      });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Webhook handler for Stripe
// @route   POST /api/payments/webhook
// @access  Public
exports.stripeWebhook = async (req, res, next) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('PaymentIntent was successful!', paymentIntent.id);
      break;
    case 'payment_intent.payment_failed':
      const paymentFailedIntent = event.data.object;
      console.log('Payment failed:', paymentFailedIntent.id);
      
      // Update order
      const orderId = paymentFailedIntent.metadata.orderId;
      if (orderId) {
        await Order.findByIdAndUpdate(orderId, {
          paymentStatus: 'failed'
        });
      }
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
};

// @desc    Get payment methods (For future implementation)
// @route   GET /api/payments/methods
// @access  Private
exports.getPaymentMethods = async (req, res, next) => {
  try {
    const methods = [
      {
        id: 'stripe',
        name: 'Credit/Debit Card',
        type: 'card',
        enabled: true,
        icon: '/payment-icons/card.svg'
      },
      {
        id: 'payfast',
        name: 'PayFast',
        type: 'gateway',
        enabled: false,
        icon: '/payment-icons/payfast.svg'
      },
      {
        id: 'cash-on-delivery',
        name: 'Cash on Delivery',
        type: 'offline',
        enabled: true,
        icon: '/payment-icons/cash.svg'
      }
    ];

    res.status(200).json({
      success: true,
      data: methods
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Request refund
// @route   POST /api/payments/refund
// @access  Private (Admin)
exports.requestRefund = async (req, res, next) => {
  try {
    const { orderId, amount, reason } = req.body;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.paymentMethod === 'stripe' && order.paymentId) {
      // Create refund in Stripe
      const refund = await stripe.refunds.create({
        payment_intent: order.paymentId,
        amount: amount ? Math.round(amount * 100) : undefined
      });

      // Update order
      order.paymentStatus = 'refunded';
      order.status = 'refunded';
      order.refundAmount = amount || order.total;
      order.refundedAt = Date.now();
      await order.save();

      const customer = await User.findById(order.customer).select('name email role');
      if (customer) {
        await notifyUser({
          user: customer,
          type: 'ORDER',
          title: 'Refund processed',
          message: `Refund for order ${order.orderNumber} has been processed.`,
          linkUrl: `/orders/${order._id}/track`,
          metadata: {
            event: 'order.refund-processed',
            orderId: order._id.toString(),
            reason: reason || null
          },
          emailTemplate: 'refund_processed',
          emailContext: {
            orderId: order.orderNumber,
            amount: amount ? String(amount) : undefined,
            actionLinks: [{ label: 'View order', url: buildAppUrl(`/orders/${order._id}/track`) }]
          }
        });
      }

      res.status(200).json({
        success: true,
        message: 'Refund processed',
        data: refund
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Cannot process refund for this payment method'
      });
    }
  } catch (error) {
    next(error);
  }
};
