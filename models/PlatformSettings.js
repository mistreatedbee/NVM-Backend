const mongoose = require('mongoose');

const platformSettingsSchema = new mongoose.Schema(
  {
    defaultCommissionPercent: { type: Number, default: 10, min: 0, max: 100 },
    perCategoryCommission: {
      type: Map,
      of: Number,
      default: {}
    },
    perVendorCommission: {
      type: Map,
      of: Number,
      default: {}
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);
