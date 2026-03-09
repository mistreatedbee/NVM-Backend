const mongoose = require('mongoose');

const promotedListingSchema = new mongoose.Schema(
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
    startAt: {
      type: Date,
      required: true
    },
    endAt: {
      type: Date,
      required: true
    },
    placement: {
      type: String,
      enum: ['HOMEPAGE', 'SEARCH', 'CATEGORY'],
      required: true
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'PAUSED', 'ENDED'],
      default: 'ACTIVE'
    }
  },
  { timestamps: true }
);

promotedListingSchema.index({ vendorId: 1, status: 1, startAt: 1, endAt: 1 });
promotedListingSchema.index({ placement: 1, status: 1, startAt: 1 });

module.exports = mongoose.model('PromotedListing', promotedListingSchema);
