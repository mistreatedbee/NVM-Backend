const express = require('express');
const router = express.Router();
const {
  uploadPaymentProof,
  confirmPayment,
  rejectPayment,
  updateOrderStatus,
  updateTrackingLocation,
  getVendorOrders,
  getOrderTracking
} = require('../controllers/orderManagementController');
const { authenticate, isVendor, isAdmin } = require('../middleware/auth');
const { validateId, validate } = require('../middleware/validator');
const multer = require('multer');

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/payment-proofs/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Customer routes
router.post('/:orderId/payment-proof', authenticate, validateId, validate, upload.single('paymentProof'), uploadPaymentProof);

// Vendor/Admin routes
router.put('/:orderId/confirm-payment', authenticate, isAdmin, validateId, validate, confirmPayment);
router.put('/:orderId/reject-payment', authenticate, isAdmin, validateId, validate, rejectPayment);
router.put('/:orderId/status', authenticate, validateId, validate, updateOrderStatus);
router.post('/:orderId/tracking-location', authenticate, validateId, validate, updateTrackingLocation);

// Tracking routes
router.get('/:orderId/tracking', authenticate, validateId, validate, getOrderTracking);

module.exports = router;

