const mongoose = require('mongoose');

const productBundleSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160
    },
    productIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      }
    ],
    bundlePrice: {
      type: Number,
      min: 0
    },
    discountPercent: {
      type: Number,
      min: 0,
      max: 100
    },
    active: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

productBundleSchema.index({ vendorId: 1, active: 1, createdAt: -1 });

module.exports = mongoose.model('ProductBundle', productBundleSchema);
