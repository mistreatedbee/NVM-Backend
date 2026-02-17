const mongoose = require('mongoose');

const reviewMediaSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['IMAGE', 'VIDEO'],
    required: true
  }
}, { _id: false });

const reviewSchema = new mongoose.Schema({
  reviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  targetType: {
    type: String,
    enum: ['PRODUCT', 'VENDOR'],
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor'
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  rating: {
    type: Number,
    required: [true, 'Please provide a rating'],
    min: 1,
    max: 5
  },
  title: {
    type: String,
    trim: true,
    maxlength: [100, 'Review title cannot be more than 100 characters']
  },
  body: {
    type: String,
    required: [true, 'Please provide review text'],
    minlength: [10, 'Review must be at least 10 characters'],
    maxlength: [2000, 'Review cannot be more than 2000 characters']
  },
  media: {
    type: [reviewMediaSchema],
    default: []
  },

  verifiedPurchase: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'HIDDEN'],
    default: 'APPROVED'
  },
  moderation: {
    reason: {
      type: String,
      maxlength: [500, 'Moderation reason cannot be more than 500 characters']
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    moderatedAt: Date
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedAt: Date,

  helpfulCount: {
    type: Number,
    default: 0
  },
  reportedCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
reviewSchema.index({ targetType: 1 });
reviewSchema.index({ productId: 1, createdAt: -1 });
reviewSchema.index({ vendorId: 1, createdAt: -1 });
reviewSchema.index({ reviewerId: 1, createdAt: -1 });
reviewSchema.index({ status: 1, createdAt: -1 });
reviewSchema.index({ rating: 1 });
reviewSchema.index({ helpfulCount: -1 });

// Prevent duplicates with order linkage where provided.
reviewSchema.index(
  { reviewerId: 1, targetType: 1, productId: 1, orderId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      targetType: 'PRODUCT',
      productId: { $exists: true },
      orderId: { $exists: true }
    }
  }
);

reviewSchema.index(
  { reviewerId: 1, targetType: 1, vendorId: 1, orderId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      targetType: 'VENDOR',
      vendorId: { $exists: true },
      orderId: { $exists: true }
    }
  }
);

// If no order is supplied, allow only one review per target.
reviewSchema.index(
  { reviewerId: 1, targetType: 1, productId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      targetType: 'PRODUCT',
      productId: { $exists: true },
      orderId: { $exists: false }
    }
  }
);

reviewSchema.index(
  { reviewerId: 1, targetType: 1, vendorId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      targetType: 'VENDOR',
      vendorId: { $exists: true },
      orderId: { $exists: false }
    }
  }
);

module.exports = mongoose.model('Review', reviewSchema);
