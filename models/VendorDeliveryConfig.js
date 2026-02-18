const mongoose = require('mongoose');

const vendorDeliveryConfigSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      unique: true
    },
    enabledZones: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryZone'
    }],
    freeDeliveryThreshold: {
      type: Number,
      default: null
    },
    pickupEnabled: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

vendorDeliveryConfigSchema.index({ vendorId: 1 });

module.exports = mongoose.model('VendorDeliveryConfig', vendorDeliveryConfigSchema);
