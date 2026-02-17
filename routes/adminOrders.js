const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/auth');
const {
  getAdminOrders,
  getAdminOrderById,
  adminUpdateOrderStatus,
  adminCancelOrder
} = require('../controllers/orderWorkflowController');

router.get('/orders', authenticate, isAdmin, getAdminOrders);
router.get('/orders/:orderId', authenticate, isAdmin, getAdminOrderById);
router.patch('/orders/:orderId/status', authenticate, isAdmin, adminUpdateOrderStatus);
router.patch('/orders/:orderId/cancel', authenticate, isAdmin, adminCancelOrder);

module.exports = router;
