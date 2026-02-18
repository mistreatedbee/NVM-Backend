const mongoose = require('mongoose');
const SubscriptionPlan = require('./SubscriptionPlan');

const vendorSubscriptionSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    unique: true
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor'
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    required: true
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'PAST_DUE', 'CANCELLED', 'active', 'cancelled', 'expired', 'suspended'],
    default: 'ACTIVE'
  },
  startAt: {
    type: Date,
    default: Date.now
  },
  endAt: {
    type: Date
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
vendorSubscriptionSchema.index({ status: 1, endAt: 1 });
vendorSubscriptionSchema.pre('validate', function syncCompatibility(next) {
  if (!this.vendor && this.vendorId) this.vendor = this.vendorId;
  if (!this.vendorId && this.vendor) this.vendorId = this.vendor;
  if (!this.startDate && this.startAt) this.startDate = this.startAt;
  if (!this.startAt && this.startDate) this.startAt = this.startDate;
  if (!this.endDate && this.endAt) this.endDate = this.endAt;
  if (!this.endAt && this.endDate) this.endAt = this.endDate;
  if (this.status === 'active') this.status = 'ACTIVE';
  if (this.status === 'cancelled') this.status = 'CANCELLED';
  next();
});

// Check if subscription is expired
vendorSubscriptionSchema.methods.isExpired = function() {
  return Boolean((this.endAt || this.endDate) && (this.endAt || this.endDate) < Date.now());
};

// Get plan features
vendorSubscriptionSchema.methods.getPlanFeatures = async function() {
  const plan = await SubscriptionPlan.findById(this.planId).select('features isActive');
  if (!plan || !plan.isActive) return null;
  return plan.features || {};
};

const VendorSubscription = mongoose.models.VendorSubscription || mongoose.model('VendorSubscription', vendorSubscriptionSchema);

module.exports = { SubscriptionPlan, VendorSubscription };

