const express = require('express');
const router = express.Router();
const {
  createOrder,
  getAllOrders,
  getOrder,
  getMyOrders,
  getVendorOrders,
  updateOrderStatus,
  cancelOrder
} = require('../controllers/orderController');
const { authenticate, isVendor, isAdmin } = require('../middleware/auth');
const { orderValidation, validateId, validate, paginationValidation } = require('../middleware/validator');

router.post('/', authenticate, orderValidation, validate, createOrder);
router.get('/', authenticate, isAdmin, paginationValidation, validate, getAllOrders);
router.get('/my/orders', authenticate, paginationValidation, validate, getMyOrders);
router.get('/vendor/orders', authenticate, isVendor, paginationValidation, validate, getVendorOrders);
router.get('/:id', authenticate, validateId, validate, getOrder);
router.put('/:id/status', authenticate, validateId, validate, updateOrderStatus);
router.put('/:id/cancel', authenticate, validateId, validate, cancelOrder);

module.exports = router;
