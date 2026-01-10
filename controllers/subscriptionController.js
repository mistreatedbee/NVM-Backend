const { SubscriptionPlan, VendorSubscription } = require('../models/VendorSubscription');
const Vendor = require('../models/Vendor');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// @desc    Get all subscription plans
// @route   GET /api/subscriptions/plans
// @access  Public
exports.getPlans = async (req, res, next) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort('price');
    
    res.status(200).json({
      success: true,
      count: plans.length,
      data: plans
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get vendor subscription
// @route   GET /api/subscriptions/my-subscription
// @access  Private (Vendor)
exports.getMySubscription = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user.id });
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }
    
    let subscription = await VendorSubscription.findOne({ vendor: vendor._id });
    
    // Create free subscription if none exists
    if (!subscription) {
      subscription = await VendorSubscription.create({
        vendor: vendor._id,
        plan: 'free',
        status: 'active'
      });
    }
    
    const planFeatures = await subscription.getPlanFeatures();
    
    res.status(200).json({
      success: true,
      data: {
        subscription,
        features: planFeatures
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Subscribe to plan
// @route   POST /api/subscriptions/subscribe
// @access  Private (Vendor)
exports.subscribeToPlan = async (req, res, next) => {
  try {
    const { planName, paymentMethod, billingCycle } = req.body;
    
    const vendor = await Vendor.findOne({ user: req.user.id });
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }
    
    const plan = await SubscriptionPlan.findOne({ 
      name: planName, 
      isActive: true,
      billingCycle: billingCycle || 'monthly'
    });
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }
    
    let subscription = await VendorSubscription.findOne({ vendor: vendor._id });
    
    if (!subscription) {
      subscription = new VendorSubscription({
        vendor: vendor._id
      });
    }
    
    // Calculate end date
    const endDate = new Date();
    if (billingCycle === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }
    
    // Update subscription
    subscription.plan = planName;
    subscription.status = 'active';
    subscription.startDate = Date.now();
    subscription.endDate = endDate;
    subscription.paymentMethod = paymentMethod;
    subscription.autoRenew = true;
    
    // Add payment record
    subscription.payments.push({
      amount: plan.price,
      currency: 'ZAR',
      status: 'completed',
      paidAt: Date.now()
    });
    
    await subscription.save();
    
    // Update vendor premium status
    vendor.isPremium = planName !== 'free';
    vendor.premiumExpiresAt = endDate;
    await vendor.save();
    
    res.status(200).json({
      success: true,
      message: 'Subscription updated successfully',
      data: subscription
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel subscription
// @route   PUT /api/subscriptions/cancel
// @access  Private (Vendor)
exports.cancelSubscription = async (req, res, next) => {
  try {
    const { reason } = req.body;
    
    const vendor = await Vendor.findOne({ user: req.user.id });
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }
    
    const subscription = await VendorSubscription.findOne({ vendor: vendor._id });
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }
    
    subscription.status = 'cancelled';
    subscription.cancelledAt = Date.now();
    subscription.cancellationReason = reason;
    subscription.autoRenew = false;
    
    await subscription.save();
    
    res.status(200).json({
      success: true,
      message: 'Subscription cancelled successfully',
      data: subscription
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Check subscription limits
// @route   GET /api/subscriptions/check-limits
// @access  Private (Vendor)
exports.checkLimits = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user.id });
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }
    
    const subscription = await VendorSubscription.findOne({ vendor: vendor._id });
    const features = await subscription.getPlanFeatures();
    
    const canAddProduct = subscription.usage.productsUsed < features.maxProducts;
    const canFeatureProduct = subscription.usage.featuredListingsUsed < features.featuredListings;
    
    res.status(200).json({
      success: true,
      data: {
        canAddProduct,
        canFeatureProduct,
        productsUsed: subscription.usage.productsUsed,
        productsLimit: features.maxProducts,
        featuredUsed: subscription.usage.featuredListingsUsed,
        featuredLimit: features.featuredListings
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Seed subscription plans (Admin)
// @route   POST /api/subscriptions/seed-plans
// @access  Private (Admin)
exports.seedPlans = async (req, res, next) => {
  try {
    await SubscriptionPlan.deleteMany({});
    
    const plans = [
      {
        name: 'free',
        displayName: 'Free',
        price: 0,
        billingCycle: 'monthly',
        features: {
          maxProducts: 10,
          maxImages: 3,
          commissionRate: 15,
          featuredListings: 0,
          analytics: false,
          prioritySupport: false,
          customBranding: false,
          bulkUpload: false,
          apiAccess: false
        }
      },
      {
        name: 'basic',
        displayName: 'Basic',
        price: 299,
        billingCycle: 'monthly',
        features: {
          maxProducts: 50,
          maxImages: 5,
          commissionRate: 12,
          featuredListings: 2,
          analytics: true,
          prioritySupport: false,
          customBranding: false,
          bulkUpload: true,
          apiAccess: false
        }
      },
      {
        name: 'professional',
        displayName: 'Professional',
        price: 599,
        billingCycle: 'monthly',
        features: {
          maxProducts: 200,
          maxImages: 10,
          commissionRate: 10,
          featuredListings: 5,
          analytics: true,
          prioritySupport: true,
          customBranding: true,
          bulkUpload: true,
          apiAccess: false
        }
      },
      {
        name: 'enterprise',
        displayName: 'Enterprise',
        price: 1299,
        billingCycle: 'monthly',
        features: {
          maxProducts: 999999,
          maxImages: 20,
          commissionRate: 8,
          featuredListings: 20,
          analytics: true,
          prioritySupport: true,
          customBranding: true,
          bulkUpload: true,
          apiAccess: true
        }
      }
    ];
    
    await SubscriptionPlan.insertMany(plans);
    
    res.status(201).json({
      success: true,
      message: 'Subscription plans seeded successfully',
      count: plans.length
    });
  } catch (error) {
    next(error);
  }
};

