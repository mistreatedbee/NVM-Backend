const express = require('express');
const router = express.Router();
const {
  createReview,
  getProductReviews,
  getVendorReviews,
  updateReview,
  deleteReview,
  addVendorResponse,
  markHelpful
} = require('../controllers/reviewController');
const { authenticate, isVendor } = require('../middleware/auth');
const { reviewValidation, validateId, validate, paginationValidation } = require('../middleware/validator');

router.post('/', authenticate, reviewValidation, validate, createReview);
router.get('/product/:productId', paginationValidation, validate, getProductReviews);
router.get('/vendor/:vendorId', paginationValidation, validate, getVendorReviews);
router.put('/:id', authenticate, validateId, validate, updateReview);
router.delete('/:id', authenticate, validateId, validate, deleteReview);
router.put('/:id/response', authenticate, isVendor, validateId, validate, addVendorResponse);
router.put('/:id/helpful', authenticate, validateId, validate, markHelpful);

module.exports = router;
