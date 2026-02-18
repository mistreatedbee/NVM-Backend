const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true
    },
    qty: {
      type: Number,
      required: true,
      min: 1,
      max: 99,
      default: 1
    },
    priceSnapshot: {
      type: Number,
      required: true,
      min: 0
    },
    titleSnapshot: {
      type: String,
      required: true,
      trim: true
    },
    imageSnapshot: {
      type: String,
      default: ''
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    items: [cartItemSchema],
    couponCode: {
      type: String,
      trim: true,
      maxlength: 64
    }
  },
  {
    timestamps: true
  }
);

cartSchema.index({ userId: 1, 'items.productId': 1 });

module.exports = mongoose.model('Cart', cartSchema);


