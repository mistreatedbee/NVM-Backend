const mongoose = require('mongoose');

const flashSaleSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true
    },
    productIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      }
    ],
    discount: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    startAt: {
      type: Date,
      required: true
    },
    endAt: {
      type: Date,
      required: true
    },
    active: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

flashSaleSchema.index({ vendorId: 1, active: 1, startAt: 1, endAt: 1 });

module.exports = mongoose.model('FlashSale', flashSaleSchema);
