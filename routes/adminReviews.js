const express = require('express');
const router = express.Router();
const {
  getAdminReviews,
  approveReview,
  rejectReview,
  hideReview,
  adminDeleteReview
} = require('../controllers/reviewController');
const { authenticate, isAdmin } = require('../middleware/auth');
const { validate, paginationValidation, validateId } = require('../middleware/validator');

router.get('/reviews', authenticate, isAdmin, paginationValidation, validate, getAdminReviews);
router.patch('/reviews/:id/approve', authenticate, isAdmin, validateId, validate, approveReview);
router.patch('/reviews/:id/reject', authenticate, isAdmin, validateId, validate, rejectReview);
router.patch('/reviews/:id/hide', authenticate, isAdmin, validateId, validate, hideReview);
router.delete('/reviews/:id', authenticate, isAdmin, validateId, validate, adminDeleteReview);

module.exports = router;
