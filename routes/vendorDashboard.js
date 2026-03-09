const express = require('express');
const { authenticate, isVendor } = require('../middleware/auth');
const { getVendorDashboardOverview } = require('../controllers/dashboardController');

const router = express.Router();

router.get('/dashboard/overview', authenticate, isVendor, getVendorDashboardOverview);

module.exports = router;
