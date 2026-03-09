const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    priceMonthly: { type: Number, required: true, min: 0 },
    features: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

subscriptionPlanSchema.index({ isActive: 1, priceMonthly: 1 });

module.exports = mongoose.models.SubscriptionPlan || mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
