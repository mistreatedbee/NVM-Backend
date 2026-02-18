const mongoose = require('mongoose');

const deliveryZoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    center: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true }
    },
    radiusKm: { type: Number, required: true, min: 0.1 },
    baseFee: { type: Number, required: true, min: 0 },
    feePerKm: { type: Number, default: 0, min: 0 },
    minimumOrderValue: { type: Number, default: 0, min: 0 },
    estimatedDays: { type: Number, default: 2, min: 1 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

deliveryZoneSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('DeliveryZone', deliveryZoneSchema);
