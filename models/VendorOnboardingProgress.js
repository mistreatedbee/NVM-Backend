const mongoose = require('mongoose');

const vendorOnboardingProgressSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true
    },
    guideSlug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    completedSteps: {
      type: [Number],
      default: []
    },
    completed: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

vendorOnboardingProgressSchema.index({ vendorId: 1, guideSlug: 1 }, { unique: true });

module.exports = mongoose.model('VendorOnboardingProgress', vendorOnboardingProgressSchema);
