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
  usernameSlug: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true
  },
  description: {
    type: String,
    required: [true, 'Please provide a store description'],
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  about: {
    type: String,
    maxlength: [2000, 'About cannot be more than 2000 characters']
  },
  bio: {
    type: String,
    maxlength: [1000, 'Bio cannot be more than 1000 characters']
  },
  logo: {
    public_id: String,
    url: String
  },
  profileImage: {
    public_id: String,
    url: String
  },
  banner: {
    public_id: String,
    url: String
  },
  coverImage: {
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
  socialLinks: {
    whatsapp: String,
    facebook: String,
    instagram: String,
    tiktok: String,
    website: String
  },
  location: {
    country: String,
    state: String,
    city: String,
    suburb: String,
    addressLine: String
  },
  
  // Banking Information (for EFT payments) - Optional but recommended
  bankDetails: {
    accountHolderName: {
      type: String
      // Made optional - vendors can add this later
    },
    accountNumber: {
      type: String
      // Made optional - vendors can add this later
    },
    bankName: {
      type: String
      // Made optional - vendors can add this later
    },
    branchCode: {
      type: String
      // Made optional - vendors can add this later
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
  accountStatus: {
    type: String,
    enum: ['active', 'pending', 'suspended', 'banned'],
    default: 'pending'
  },
  approvedAt: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReason: String,
  suspensionReason: String,
  suspendedAt: Date,
  suspendedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  bannedAt: Date,
  bannedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  statusUpdatedAt: Date,
  statusUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Verification and compliance documents
  documents: [{
    type: {
      type: String,
      enum: ['business-registration', 'tax-certificate', 'compliance', 'identity', 'bank-proof', 'other'],
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    file: {
      public_id: String,
      url: { type: String, required: true }
    },
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    rejectionReason: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    verifiedAt: Date,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    expiresAt: Date
  }],
  complianceChecks: [{
    checkType: {
      type: String,
      enum: ['kyc', 'business-license', 'tax', 'banking', 'policy', 'other'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'passed', 'failed'],
      required: true
    },
    notes: String,
    checkedAt: {
      type: Date,
      default: Date.now
    },
    nextReviewAt: Date,
    checkedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }],
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
  topRatedBadge: {
    type: Boolean,
    default: false
  },
  topRatedSince: Date,
  
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
  businessHours: String,
  policies: {
    returns: String,
    shipping: String
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified'],
    default: 'pending'
  },
  privacy: {
    showPhone: {
      type: Boolean,
      default: true
    },
    showEmail: {
      type: Boolean,
      default: true
    }
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
vendorSchema.index({ status: 1 });
vendorSchema.index({ accountStatus: 1 });
vendorSchema.index({ category: 1 });
vendorSchema.index({ rating: -1 });
vendorSchema.index({ totalSales: -1 });
vendorSchema.index({ 'location.city': 1, 'location.state': 1 });
vendorSchema.index({ storeName: 'text', description: 'text' });
vendorSchema.index({ 'documents.status': 1 });
vendorSchema.index({ 'complianceChecks.status': 1 });

// Generate slug before saving
vendorSchema.pre('save', function(next) {
  if (this.isModified('storeName') || !this.slug) {
    const generatedSlug = this.storeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    this.slug = generatedSlug;
    if (!this.usernameSlug || this.isModified('storeName')) {
      this.usernameSlug = generatedSlug;
    }
  }

  if (this.isModified('usernameSlug') && this.usernameSlug) {
    this.usernameSlug = this.usernameSlug
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  next();
});

module.exports = mongoose.model('Vendor', vendorSchema);
