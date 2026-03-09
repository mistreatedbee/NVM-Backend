const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const {
  getPlatformSettings,
  updatePlatformSettings,
  createSubscriptionPlan,
  listSubscriptionPlans,
  updateSubscriptionPlan,
  assignVendorSubscription,
  createPromotedListing,
  updatePromotedListing,
  listActivePromotedListings,
  listAdminPromotedListings,
  setFeaturedVendor,
  listFeaturedVendors,
  listAdminFeaturedVendors,
  createReferralCode,
  trackReferralSignup,
  listReferralCodesAdmin,
  listVendorSubscriptionsAdmin,
  listReferralEventsAdmin,
  approveReferralReward
} = require('../controllers/monetizationController');

router.get('/plans', listSubscriptionPlans);
router.get('/promoted-listings/active', listActivePromotedListings);
router.get('/featured-vendors', listFeaturedVendors);

router.post('/referrals/events', trackReferralSignup);
router.post('/referrals/codes', authenticate, requireRole('VENDOR', 'CUSTOMER'), createReferralCode);

router.get('/admin/platform-settings', authenticate, requireRole('ADMIN'), getPlatformSettings);
router.put('/admin/platform-settings', authenticate, requireRole('ADMIN'), updatePlatformSettings);

router.post('/admin/plans', authenticate, requireRole('ADMIN'), createSubscriptionPlan);
router.put('/admin/plans/:id', authenticate, requireRole('ADMIN'), updateSubscriptionPlan);
router.post('/admin/vendor-subscriptions', authenticate, requireRole('ADMIN'), assignVendorSubscription);
router.get('/admin/vendor-subscriptions', authenticate, requireRole('ADMIN'), listVendorSubscriptionsAdmin);

router.post('/admin/promoted-listings', authenticate, requireRole('ADMIN'), createPromotedListing);
router.put('/admin/promoted-listings/:id', authenticate, requireRole('ADMIN'), updatePromotedListing);
router.get('/admin/promoted-listings', authenticate, requireRole('ADMIN'), listAdminPromotedListings);

router.post('/admin/featured-vendors', authenticate, requireRole('ADMIN'), setFeaturedVendor);
router.get('/admin/featured-vendors', authenticate, requireRole('ADMIN'), listAdminFeaturedVendors);
router.get('/admin/referrals/codes', authenticate, requireRole('ADMIN'), listReferralCodesAdmin);
router.get('/admin/referrals/events', authenticate, requireRole('ADMIN'), listReferralEventsAdmin);
router.patch('/admin/referrals/events/:id/approve', authenticate, requireRole('ADMIN'), approveReferralReward);

module.exports = router;
