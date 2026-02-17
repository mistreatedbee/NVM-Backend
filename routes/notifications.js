const express = require('express');
const router = express.Router();
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification
} = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');
const { validateId, validate, paginationValidation } = require('../middleware/validator');

router.get('/', authenticate, paginationValidation, validate, getNotifications);
router.get('/unread-count', authenticate, getUnreadCount);
router.patch('/:id/read', authenticate, validateId, validate, markAsRead);
router.patch('/read-all', authenticate, markAllAsRead);
router.delete('/:id', authenticate, validateId, validate, deleteNotification);

// Backward compatibility
router.put('/:id/read', authenticate, validateId, validate, markAsRead);
router.put('/read-all', authenticate, markAllAsRead);

module.exports = router;

