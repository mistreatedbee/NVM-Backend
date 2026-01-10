const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  storeName: {
    type: String,
    required: [true, 'Please provide a store name'],
    trim: true,
    maxlength: [100, 'Store name cannot be more than 100 characters']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  description: {
    type: String,
    required: [true, 'Please provide a store description'],
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  logo: {
    public_id: String,
    url: String
  },
  banner: {
    public_id: String,
    url: String
  },
  category: {
    type: String,
    required: true,
    enum: ['fashion', 'electronics', 'food', 'services', 'health', 'beauty', 'home', 'sports', 'books', 'art', 'other']
  },
  businessType: {
    type: String,
    enum: ['individual', 'business', 'freelancer'],
    default: 'individual'
  },
  taxId: String,
  businessLicense: String,
  
  // Contact Information
  email: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  website: String,
  
  // Address
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, required: true },
    zipCode: { type: String, required: true }
  },
  
  // Social Media
  socialMedia: {
    facebook: String,
    twitter: String,
    instagram: String,
    linkedin: String
  },
  
  // Banking Information (for EFT payments)
  bankDetails: {
    accountHolderName: {
      type: String,
      required: [true, 'Account holder name is required']
    },
    accountNumber: {
      type: String,
      required: [true, 'Account number is required']
    },
    bankName: {
      type: String,
      required: [true, 'Bank name is required']
    },
    branchCode: {
      type: String,
      required: [true, 'Branch code is required']
    },
    accountType: {
      type: String,
      enum: ['savings', 'current', 'business'],
      default: 'current'
    },
    swiftCode: String // For international payments
  },
  
  // Status and Approval
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'suspended'],
    default: 'pending'
  },
  approvedAt: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReason: String,
  
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
  totalProducts: {
    type: Number,
    default: 0
  },
  totalSales: {
    type: Number,
    default: 0
  },
  totalRevenue: {
    type: Number,
    default: 0
  },
  
  // Settings
  settings: {
    autoAcceptOrders: {
      type: Boolean,
      default: false
    },
    processingTime: {
      type: Number,
      default: 3 // days
    },
    returnPolicy: String,
    shippingPolicy: String,
    termsAndConditions: String
  },
  
  // Subscription/Features
  isPremium: {
    type: Boolean,
    default: false
  },
  premiumExpiresAt: Date,
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
vendorSchema.index({ slug: 1 });
vendorSchema.index({ user: 1 });
vendorSchema.index({ status: 1 });
vendorSchema.index({ category: 1 });
vendorSchema.index({ rating: -1 });
vendorSchema.index({ totalSales: -1 });
vendorSchema.index({ storeName: 'text', description: 'text' });

// Generate slug before saving
vendorSchema.pre('save', function(next) {
  if (this.isModified('storeName')) {
    this.slug = this.storeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  next();
});

module.exports = mongoose.model('Vendor', vendorSchema);
