const mongoose = require('mongoose');

const viewedItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    viewedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const recentlyViewedSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    items: [viewedItemSchema]
  },
  {
    timestamps: true
  }
);

recentlyViewedSchema.index({ userId: 1, 'items.viewedAt': -1 });

module.exports = mongoose.model('RecentlyViewed', recentlyViewedSchema);


