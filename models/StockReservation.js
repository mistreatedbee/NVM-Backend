const mongoose = require('mongoose');

const stockReservationSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    sku: {
      type: String,
      trim: true
    },
    qty: {
      type: Number,
      required: true,
      min: 1
    },
    expiresAt: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'EXPIRED', 'CONSUMED'],
      default: 'ACTIVE'
    }
  },
  { timestamps: true }
);

stockReservationSchema.index({ status: 1, expiresAt: 1 });
stockReservationSchema.index({ vendorId: 1, productId: 1, sku: 1, status: 1 });

module.exports = mongoose.model('StockReservation', stockReservationSchema);
