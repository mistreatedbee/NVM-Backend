const express = require('express');
const router = express.Router();
const {
  getPlans,
  getMySubscription,
  subscribeToPlan,
  cancelSubscription,
  checkLimits,
  seedPlans
} = require('../controllers/subscriptionController');
const { authenticate, isVendor, isAdmin } = require('../middleware/auth');

router.get('/plans', getPlans);
router.get('/my-subscription', authenticate, isVendor, getMySubscription);
router.post('/subscribe', authenticate, isVendor, subscribeToPlan);
router.put('/cancel', authenticate, isVendor, cancelSubscription);
router.get('/check-limits', authenticate, isVendor, checkLimits);
router.post('/seed-plans', authenticate, isAdmin, seedPlans);

module.exports = router;

