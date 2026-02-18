const express = require('express');
const { authenticate, isAdmin } = require('../middleware/auth');
const { getAdminDashboardOverview } = require('../controllers/dashboardController');

const router = express.Router();

router.get('/dashboard/overview', authenticate, isAdmin, getAdminDashboardOverview);

module.exports = router;
