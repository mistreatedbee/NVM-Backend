const express = require('express');
const router = express.Router();
const {
  createReview,
  getAllReviews,
  getProductReviews,
  getVendorReviews,
  updateReview,
  deleteReview,
  addVendorResponse,
  markHelpful,
  reportReview,
  getReportedReviews,
  moderateReview
} = require('../controllers/reviewController');
const { authenticate, isVendor, isAdmin } = require('../middleware/auth');
const {
  reviewValidation,
  reviewResponseValidation,
  reviewReportValidation,
  reviewModerationValidation,
  validateId,
  validate,
  paginationValidation
} = require('../middleware/validator');

// Get all reviews (public)
router.get('/', paginationValidation, validate, getAllReviews);
router.get('/admin/reported', authenticate, isAdmin, paginationValidation, validate, getReportedReviews);

router.post('/', authenticate, reviewValidation, validate, createReview);
router.get('/product/:productId', paginationValidation, validate, getProductReviews);
router.get('/vendor/:vendorId', paginationValidation, validate, getVendorReviews);
router.put('/:id', authenticate, validateId, validate, updateReview);
router.delete('/:id', authenticate, validateId, validate, deleteReview);
router.put('/:id/response', authenticate, isVendor, validateId, reviewResponseValidation, validate, addVendorResponse);
router.put('/:id/helpful', authenticate, validateId, validate, markHelpful);
router.post('/:id/report', authenticate, validateId, reviewReportValidation, validate, reportReview);
router.put('/:id/moderate', authenticate, isAdmin, validateId, reviewModerationValidation, validate, moderateReview);

module.exports = router;
