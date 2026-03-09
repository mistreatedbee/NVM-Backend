const mongoose = require('mongoose');

const featuredVendorSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      unique: true
    },
    isFeatured: { type: Boolean, default: true },
    featuredStartAt: { type: Date, required: true },
    featuredEndAt: { type: Date, required: true },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

featuredVendorSchema.index({ isFeatured: 1, sortOrder: 1, featuredStartAt: 1, featuredEndAt: 1 });

module.exports = mongoose.model('FeaturedVendor', featuredVendorSchema);
