const express = require('express');
const router = express.Router();
const { getAdminAnalytics, getVendorAnalytics } = require('../controllers/analyticsController');
const { authenticate, isAdmin, isVendor } = require('../middleware/auth');

router.get('/admin', authenticate, isAdmin, getAdminAnalytics);
router.get('/vendor', authenticate, isVendor, getVendorAnalytics);

module.exports = router;

