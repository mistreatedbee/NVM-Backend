const mongoose = require('mongoose');

const wishlistListSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    productIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }]
  },
  { timestamps: true }
);

wishlistListSchema.index({ userId: 1 });
wishlistListSchema.index({ userId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('WishlistList', wishlistListSchema);
