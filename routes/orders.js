const express = require('express');
const router = express.Router();
const {
  createOrder,
  getAllOrders,
  getOrder,
  getVendorOrders,
  updateOrderStatus,
  cancelOrder
} = require('../controllers/orderController');
const {
  getMyOrders,
  getMyOrderById,
  getMyOrderTracking
} = require('../controllers/orderWorkflowController');
const { authenticate, isVendor, isAdmin } = require('../middleware/auth');
const { requireActiveVendorAccount } = require('../middleware/requireActiveVendorAccount');
const { orderValidation, validateId, validate, paginationValidation } = require('../middleware/validator');

router.post('/', authenticate, orderValidation, validate, createOrder);
router.get('/', authenticate, isAdmin, paginationValidation, validate, getAllOrders);
router.get('/my', authenticate, paginationValidation, validate, getMyOrders);
router.get('/my/orders', authenticate, paginationValidation, validate, getMyOrders);
router.get('/my/:orderId', authenticate, getMyOrderById);
router.get('/my/:orderId/tracking', authenticate, getMyOrderTracking);
// Vendor orders - just need to be authenticated, will check vendor profile in controller
router.get('/vendor/orders', authenticate, isVendor, requireActiveVendorAccount, paginationValidation, validate, getVendorOrders);
router.get('/:id', authenticate, validateId, validate, getOrder);
router.put('/:id/status', authenticate, requireActiveVendorAccount, validateId, validate, updateOrderStatus);
router.put('/:id/cancel', authenticate, validateId, validate, cancelOrder);

module.exports = router;
