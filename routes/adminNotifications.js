const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/auth');
const { broadcastNotification } = require('../controllers/notificationController');

router.post('/notifications/broadcast', authenticate, isAdmin, broadcastNotification);

module.exports = router;
