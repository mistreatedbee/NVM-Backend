const mongoose = require('mongoose');

const alertSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    type: {
      type: String,
      enum: ['PRICE_DROP', 'BACK_IN_STOCK'],
      required: true
    },
    targetPrice: {
      type: Number,
      min: 0
    },
    active: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

alertSubscriptionSchema.index({ userId: 1, productId: 1, type: 1 }, { unique: true });
alertSubscriptionSchema.index({ productId: 1, type: 1, active: 1 });

module.exports = mongoose.model('AlertSubscription', alertSubscriptionSchema);
