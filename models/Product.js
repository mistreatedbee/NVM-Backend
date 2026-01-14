const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Please provide a product name'],
    trim: true,
    maxlength: [200, 'Product name cannot be more than 200 characters']
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
    unique: true,
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
    sku: String,
    price: Number,
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
  totalReviews: {
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
    enum: ['draft', 'active', 'inactive', 'out-of-stock'],
    // Vendors expect newly created products to be visible immediately.
    // If stock is 0 and inventory is tracked, the pre-save hook will mark it as 'out-of-stock'.
    default: 'active'
  },
  featured: {
    type: Boolean,
    default: false
  },
  
  // Moderation
  isApproved: {
    type: Boolean,
    default: true
  },
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
productSchema.index({ slug: 1 });
productSchema.index({ vendor: 1 });
productSchema.index({ category: 1 });
productSchema.index({ status: 1 });
productSchema.index({ price: 1 });
productSchema.index({ rating: -1 });
productSchema.index({ totalSales: -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });

// Generate slug before saving
productSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + '-' + Date.now();
  }
  next();
});

// Update status based on stock
productSchema.pre('save', function(next) {
  if (this.trackInventory && this.stock === 0) {
    this.status = 'out-of-stock';
  }
  next();
});

module.exports = mongoose.model('Product', productSchema);
