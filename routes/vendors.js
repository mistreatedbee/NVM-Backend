const express = require('express');
const router = express.Router();
const {
  createVendor,
  getVendor,
  getVendorBySlug,
  getAllVendors,
  updateVendor,
  getMyVendorProfile,
  getVendorAnalytics,
  approveVendor,
  rejectVendor
} = require('../controllers/vendorController');
const { authenticate, isVendor, isAdmin } = require('../middleware/auth');
const { vendorValidation, validateId, validate, paginationValidation } = require('../middleware/validator');

router.post('/', authenticate, isVendor, vendorValidation, validate, createVendor);
router.get('/', paginationValidation, validate, getAllVendors);
router.get('/me/profile', authenticate, isVendor, getMyVendorProfile);
router.get('/slug/:slug', getVendorBySlug);
router.get('/:id', validateId, validate, getVendor);
router.put('/:id', authenticate, validateId, validate, updateVendor);
router.get('/:id/analytics', authenticate, validateId, validate, getVendorAnalytics);
router.put('/:id/approve', authenticate, isAdmin, validateId, validate, approveVendor);
router.put('/:id/reject', authenticate, isAdmin, validateId, validate, rejectVendor);

module.exports = router;
