const mongoose = require('mongoose');

const pickupPointSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      default: null
    },
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, default: '' },
      country: { type: String, required: true },
      zipCode: { type: String, default: '' }
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        required: true
      }
    },
    instructions: { type: String, default: '' },
    businessHours: { type: mongoose.Schema.Types.Mixed, default: null },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

pickupPointSchema.index({ location: '2dsphere' });
pickupPointSchema.index({ vendorId: 1, isActive: 1 });

module.exports = mongoose.model('PickupPoint', pickupPointSchema);
