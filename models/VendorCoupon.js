const mongoose = require('mongoose');

const vendorCouponSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
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
    startAt: Date,
    endAt: Date,
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
    }
  },
  { timestamps: true }
);

vendorCouponSchema.index({ vendorId: 1, code: 1 }, { unique: true });
vendorCouponSchema.index({ vendorId: 1, active: 1, endAt: 1 });

module.exports = mongoose.model('VendorCoupon', vendorCouponSchema);
