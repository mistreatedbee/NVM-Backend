const mongoose = require('mongoose');

const referralCodeSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },
    role: {
      type: String,
      enum: ['vendor', 'customer'],
      required: true
    },
    rewardType: {
      type: String,
      enum: ['CREDIT', 'PERCENT', 'FIXED'],
      required: true
    },
    rewardValue: {
      type: Number,
      required: true,
      min: 0
    },
    active: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

referralCodeSchema.index({ ownerUserId: 1, active: 1 });

module.exports = mongoose.model('ReferralCode', referralCodeSchema);
