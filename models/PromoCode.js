const mongoose = require('mongoose');

const promoCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 40
    },
    discountType: {
      type: String,
      enum: ['PERCENT', 'FIXED'],
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    minSpend: {
      type: Number,
      default: 0,
      min: 0
    },
    maxUses: {
      type: Number,
      default: 0,
      min: 0
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0
    },
    active: {
      type: Boolean,
      default: true
    },
    expiresAt: Date
  },
  { timestamps: true }
);

promoCodeSchema.index({ active: 1, expiresAt: 1 });

module.exports = mongoose.model('PromoCode', promoCodeSchema);
