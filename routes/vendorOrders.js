const express = require('express');
const router = express.Router();
const { authenticate, isVendor } = require('../middleware/auth');
const { requireActiveVendorAccount } = require('../middleware/requireActiveVendorAccount');
const {
  getVendorOrders,
  getVendorOrderById,
  updateVendorItemStatus,
  updateVendorItemTracking
} = require('../controllers/orderWorkflowController');

router.get('/orders', authenticate, isVendor, requireActiveVendorAccount, getVendorOrders);
router.get('/orders/:orderId', authenticate, isVendor, requireActiveVendorAccount, getVendorOrderById);
router.patch('/orders/:orderId/items/:productId/status', authenticate, isVendor, requireActiveVendorAccount, updateVendorItemStatus);
router.patch('/orders/:orderId/items/:productId/tracking', authenticate, isVendor, requireActiveVendorAccount, updateVendorItemTracking);

module.exports = router;
