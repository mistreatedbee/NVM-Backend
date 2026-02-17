const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const { optionalAuthenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validator');
const { trackProductView, trackProductClick, trackProductAddToCart } = require('../controllers/vendorToolkitController');

const router = express.Router();

const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many tracking requests. Try again shortly.' }
});

const sourceValidator = body('source')
  .optional()
  .isIn(['SEARCH', 'HOMEPAGE', 'VENDOR_PAGE', 'DIRECT', 'OTHER'])
  .withMessage('Invalid source');

router.post(
  '/product-view',
  optionalAuthenticate,
  trackingLimiter,
  body('productId').isMongoId().withMessage('productId is required'),
  sourceValidator,
  body('sessionId').optional().isString().isLength({ max: 150 }).withMessage('sessionId too long'),
  validate,
  trackProductView
);

router.post(
  '/product-click',
  optionalAuthenticate,
  trackingLimiter,
  body('productId').isMongoId().withMessage('productId is required'),
  sourceValidator,
  body('sessionId').optional().isString().isLength({ max: 150 }).withMessage('sessionId too long'),
  validate,
  trackProductClick
);

router.post(
  '/add-to-cart',
  optionalAuthenticate,
  trackingLimiter,
  body('productId').isMongoId().withMessage('productId is required'),
  sourceValidator,
  body('sessionId').optional().isString().isLength({ max: 150 }).withMessage('sessionId too long'),
  validate,
  trackProductAddToCart
);

module.exports = router;
