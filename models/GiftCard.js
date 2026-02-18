const mongoose = require('mongoose');

const giftCardSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 40
    },
    balance: {
      type: Number,
      required: true,
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

giftCardSchema.index({ active: 1, expiresAt: 1 });

module.exports = mongoose.model('GiftCard', giftCardSchema);
