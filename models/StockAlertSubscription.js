const mongoose = require('mongoose');

const stockAlertSubscriptionSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    variantSku: {
      type: String,
      trim: true
    },
    threshold: {
      type: Number,
      default: 5,
      min: 0
    },
    active: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

stockAlertSubscriptionSchema.index({ vendorId: 1, productId: 1, variantSku: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('StockAlertSubscription', stockAlertSubscriptionSchema);
