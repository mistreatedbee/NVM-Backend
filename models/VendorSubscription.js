const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ['free', 'basic', 'professional', 'enterprise']
  },
  displayName: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    default: 0
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly'],
    default: 'monthly'
  },
  features: {
    maxProducts: {
      type: Number,
      default: 10
    },
    maxImages: {
      type: Number,
      default: 5
    },
    commissionRate: {
      type: Number,
      default: 15 // percentage
    },
    featuredListings: {
      type: Number,
      default: 0
    },
    analytics: {
      type: Boolean,
      default: false
    },
    prioritySupport: {
      type: Boolean,
      default: false
    },
    customBranding: {
      type: Boolean,
      default: false
    },
    bulkUpload: {
      type: Boolean,
      default: false
    },
    apiAccess: {
      type: Boolean,
      default: false
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const vendorSubscriptionSchema = new mongoose.Schema({
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    unique: true
  },
  plan: {
    type: String,
    enum: ['free', 'basic', 'professional', 'enterprise'],
    default: 'free'
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'expired', 'suspended'],
    default: 'active'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date
  },
  autoRenew: {
    type: Boolean,
    default: true
  },
  paymentMethod: {
    type: String,
    enum: ['stripe', 'payfast', 'bank-transfer']
  },
  stripeSubscriptionId: String,
  payfastSubscriptionId: String,
  
  // Usage tracking
  usage: {
    productsUsed: {
      type: Number,
      default: 0
    },
    featuredListingsUsed: {
      type: Number,
      default: 0
    }
  },
  
  // Payment history
  payments: [{
    amount: Number,
    currency: {
      type: String,
      default: 'ZAR'
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded']
    },
    paymentId: String,
    paidAt: Date
  }],
  
  // Cancellation
  cancelledAt: Date,
  cancellationReason: String
}, {
  timestamps: true
});

// Indexes
vendorSubscriptionSchema.index({ vendor: 1 });
vendorSubscriptionSchema.index({ status: 1 });
vendorSubscriptionSchema.index({ endDate: 1 });

// Check if subscription is expired
vendorSubscriptionSchema.methods.isExpired = function() {
  return this.endDate && this.endDate < Date.now();
};

// Get plan features
vendorSubscriptionSchema.methods.getPlanFeatures = async function() {
  const SubscriptionPlan = mongoose.model('SubscriptionPlan');
  const plan = await SubscriptionPlan.findOne({ name: this.plan, isActive: true });
  return plan ? plan.features : null;
};

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
const VendorSubscription = mongoose.model('VendorSubscription', vendorSubscriptionSchema);

module.exports = { SubscriptionPlan, VendorSubscription };

