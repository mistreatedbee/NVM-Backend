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
const {
  reorder,
  createReturnRequest,
  getMyReturnRequests
} = require('../controllers/orderCustomerController');
const {
  uploadPaymentProof,
  getMyPaymentProof
} = require('../controllers/paymentProofController');
const { authenticate, isVendor, isAdmin } = require('../middleware/auth');
const { requireActiveVendorAccount } = require('../middleware/requireActiveVendorAccount');
const { orderValidation, validateId, validate, paginationValidation } = require('../middleware/validator');
const multer = require('multer');

const upload = multer({
  dest: 'uploads/payment-proofs/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    return cb(new Error('Only PDF/JPG/PNG files are allowed'));
  }
});

router.post('/', authenticate, orderValidation, validate, createOrder);
router.get('/', authenticate, isAdmin, paginationValidation, validate, getAllOrders);
router.get('/my', authenticate, paginationValidation, validate, getMyOrders);
router.get('/my/orders', authenticate, paginationValidation, validate, getMyOrders);
router.get('/my/:orderId', authenticate, getMyOrderById);
router.get('/my/:orderId/tracking', authenticate, getMyOrderTracking);
router.get('/my/returns', authenticate, getMyReturnRequests);
router.get('/my/:orderId/payment-proof', authenticate, getMyPaymentProof);
router.post('/:orderId/payment-proof', authenticate, upload.single('paymentProof'), uploadPaymentProof);
router.post('/:orderId/reorder', authenticate, reorder);
router.post('/:orderId/returns', authenticate, createReturnRequest);
// Vendor orders - just need to be authenticated, will check vendor profile in controller
router.get('/vendor/orders', authenticate, isVendor, requireActiveVendorAccount, paginationValidation, validate, getVendorOrders);
router.get('/:id', authenticate, validateId, validate, getOrder);
router.put('/:id/status', authenticate, requireActiveVendorAccount, validateId, validate, updateOrderStatus);
router.put('/:id/cancel', authenticate, validateId, validate, cancelOrder);

module.exports = router;
