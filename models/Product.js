const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Please provide a product name'],
    trim: true,
    maxlength: [200, 'Product name cannot be more than 200 characters']
  },
  title: {
    type: String,
    trim: true,
    maxlength: [200, 'Product title cannot be more than 200 characters']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  description: {
    type: String,
    required: [true, 'Please provide a product description'],
    maxlength: [5000, 'Description cannot be more than 5000 characters']
  },
  shortDescription: {
    type: String,
    maxlength: [300, 'Short description cannot be more than 300 characters']
  },
  
  // Product Type
  productType: {
    type: String,
    enum: ['physical', 'digital', 'service'],
    required: true,
    default: 'physical'
  },
  
  // Category
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  subcategory: String,
  tags: [String],
  brand: {
    type: String,
    trim: true,
    maxlength: [120, 'Brand cannot be more than 120 characters']
  },
  location: {
    city: String,
    state: String,
    country: String,
    serviceArea: String
  },
  
  // Pricing
  price: {
    type: Number,
    required: [true, 'Please provide a price'],
    min: 0
  },
  compareAtPrice: {
    type: Number,
    min: 0
  },
  costPrice: {
    type: Number,
    min: 0
  },
  
  // Inventory
  sku: {
    type: String,
    sparse: true
  },
  stock: {
    type: Number,
    default: 0,
    min: 0
  },
  trackInventory: {
    type: Boolean,
    default: true
  },
  lowStockThreshold: {
    type: Number,
    default: 5
  },
  
  // Variants (e.g., size, color)
  variants: [{
    name: String, // e.g., "Size: Large, Color: Red"
    options: [String],
    sku: String,
    price: Number,
    priceOverride: Number,
    stock: Number,
    attributes: [{
      key: String, // e.g., "Size"
      value: String // e.g., "Large"
    }]
  }],
  
  // Images
  images: [{
    public_id: String,
    url: {
      type: String,
      required: true
    },
    alt: String
  }],
  specifications: [{
    key: {
      type: String,
      trim: true
    },
    value: {
      type: String,
      trim: true
    }
  }],
  
  // Digital Product
  digitalFile: {
    public_id: String,
    url: String,
    filename: String,
    size: Number
  },
  
  // Service Details
  serviceDetails: {
    duration: String,
    deliveryTime: String,
    revisions: Number
  },
  
  // Shipping
  shipping: {
    weight: Number,
    dimensions: {
      length: Number,
      width: Number,
      height: Number
    },
    freeShipping: {
      type: Boolean,
      default: false
    },
    shippingCost: {
      type: Number,
      default: 0
    }
  },
  
  // SEO
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String]
  },
  
  // Stats
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  ratingAvg: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  ratingCount: {
    type: Number,
    default: 0
  },
  totalSales: {
    type: Number,
    default: 0
  },
  views: {
    type: Number,
    default: 0
  },
  
  // Status
  status: {
    type: String,
    enum: ['DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED'],
    default: 'DRAFT'
  },
  featured: {
    type: Boolean,
    default: false
  },

  submittedForReviewAt: Date,
  publishedAt: Date,
  scheduledPublishAt: Date,
  publishedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: Date,
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReason: {
    type: String,
    maxlength: [500, 'Rejection reason cannot be more than 500 characters']
  },
  lastEditedAt: Date,
  lastEditedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  reports: [{
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    reason: {
      type: String,
      enum: ['counterfeit', 'misleading', 'prohibited', 'pricing', 'abuse', 'other'],
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
    handledAt: Date,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  reportCount: {
    type: Number,
    default: 0
  },
  flagged: {
    type: Boolean,
    default: false
  },
  flagReason: {
    type: String,
    default: ''
  },
  flagSeverity: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', ''],
    default: ''
  },
  activityLogs: [{
    action: {
      type: String,
      required: true
    },
    message: String,
    metadata: mongoose.Schema.Types.Mixed,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    performedByRole: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
productSchema.index({ vendor: 1 });
productSchema.index({ vendorId: 1 });
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ 'location.city': 1, 'location.state': 1 });
productSchema.index({ status: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ status: 1, isActive: 1, createdAt: -1 });
productSchema.index({ price: 1 });
productSchema.index({ ratingAvg: -1 });
productSchema.index({ rating: -1 });
productSchema.index({ totalSales: -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ publishedAt: -1 });
productSchema.index({ reportCount: -1 });
productSchema.index({ flagged: 1, flagSeverity: 1, createdAt: -1 });
productSchema.index({ status: 1, isActive: 1, category: 1, price: 1 });
productSchema.index({ featured: 1, status: 1, isActive: 1 });
productSchema.index({ 'reports.status': 1 });
productSchema.index({ title: 'text', name: 'text', description: 'text' });
productSchema.index({ vendor: 1, sku: 1 }, { unique: true, sparse: true });
productSchema.index({ status: 1, isActive: 1, scheduledPublishAt: 1 });

// Generate slug before saving
productSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.title = this.name;
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + '-' + Date.now();
  } else if (this.isModified('title') && !this.isModified('name') && this.title) {
    this.name = this.title;
  }
  next();
});

module.exports = mongoose.model('Product', productSchema);
