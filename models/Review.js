const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor'
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  order: {
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
  comment: {
    type: String,
    required: [true, 'Please provide a comment'],
    maxlength: [1000, 'Comment cannot be more than 1000 characters']
  },
  images: [{
    public_id: String,
    url: String
  }],
  videos: [{
    public_id: String,
    url: String,
    duration: Number
  }],
  
  // Moderation
  isApproved: {
    type: Boolean,
    default: true
  },
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  moderationReason: String,
  
  // Vendor Response
  vendorResponse: {
    comment: String,
    respondedAt: Date
  },
  
  // Helpful votes
  helpfulCount: {
    type: Number,
    default: 0
  },
  helpfulVotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Verification
  isVerifiedPurchase: {
    type: Boolean,
    default: false
  },
  
  // Reporting & moderation workflow
  reports: [{
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    reason: {
      type: String,
      enum: ['spam', 'abuse', 'fake', 'off-topic', 'copyright', 'other'],
      required: true
    },
    details: {
      type: String,
      maxlength: [500, 'Report details cannot be more than 500 characters']
    },
    status: {
      type: String,
      enum: ['open', 'resolved', 'dismissed'],
      default: 'open'
    },
    handledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    handledAt: Date
  }],
  reportCount: {
    type: Number,
    default: 0
  },
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
reviewSchema.index({ product: 1 });
reviewSchema.index({ vendor: 1 });
reviewSchema.index({ customer: 1 });
reviewSchema.index({ rating: 1 });
reviewSchema.index({ createdAt: -1 });
reviewSchema.index({ isApproved: 1 });
reviewSchema.index({ reportCount: -1 });
reviewSchema.index({ 'reports.status': 1 });

// Ensure one review per customer per product
reviewSchema.index({ product: 1, customer: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Review', reviewSchema);
