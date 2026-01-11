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
const upload = require('../middleware/upload');

// Create vendor - authenticated user (not necessarily vendor role yet)
router.post('/', authenticate, upload.single('logo'), vendorValidation, validate, createVendor);

// Get all vendors - public/admin can filter by status
router.get('/', paginationValidation, validate, getAllVendors);

// Get my vendor profile - must be authenticated
router.get('/me/profile', authenticate, getMyVendorProfile);
router.get('/slug/:slug', getVendorBySlug);
router.get('/:id', validateId, validate, getVendor);
router.put('/:id', authenticate, validateId, validate, updateVendor);
router.get('/:id/analytics', authenticate, validateId, validate, getVendorAnalytics);
router.put('/:id/approve', authenticate, isAdmin, validateId, validate, approveVendor);
router.put('/:id/reject', authenticate, isAdmin, validateId, validate, rejectVendor);

module.exports = router;
