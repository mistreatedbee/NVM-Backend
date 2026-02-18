const mongoose = require('mongoose');

const referralEventSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    referredUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    firstOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REWARDED'],
      default: 'PENDING'
    }
  },
  { timestamps: true }
);

referralEventSchema.index({ code: 1, status: 1, createdAt: -1 });
referralEventSchema.index({ referredUserId: 1, createdAt: -1 });

module.exports = mongoose.model('ReferralEvent', referralEventSchema);
