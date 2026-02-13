const express = require('express');
const router = express.Router();
const {
  createVendor,
  getVendor,
  getAdminVendorDetails,
  getVendorBySlug,
  getAllVendors,
  getAdminVendors,
  updateVendor,
  adminUpdateVendorProfile,
  updateVendorStatus,
  uploadVendorDocument,
  reviewVendorDocument,
  addComplianceCheck,
  getVendorDocuments,
  getVendorActivityLogs,
  getVendorPerformanceOverview,
  getMyVendorProfile,
  getVendorAnalytics,
  approveVendor,
  rejectVendor
} = require('../controllers/vendorController');
const { authenticate, isAdmin } = require('../middleware/auth');
const {
  vendorValidation,
  vendorStatusValidation,
  adminVendorUpdateValidation,
  vendorDocumentValidation,
  vendorDocumentReviewValidation,
  vendorComplianceValidation,
  validateId,
  validateDocumentId,
  validate,
  paginationValidation
} = require('../middleware/validator');
const upload = require('../middleware/upload');
const uploadDocument = require('../middleware/uploadDocument');

// Create vendor - authenticated user (not necessarily vendor role yet)
router.post('/', authenticate, upload.single('logo'), vendorValidation, validate, createVendor);

// Get all vendors - public/admin can filter by status
router.get('/', paginationValidation, validate, getAllVendors);
router.get('/admin/all', authenticate, isAdmin, paginationValidation, validate, getAdminVendors);
router.get('/admin/:id', authenticate, isAdmin, validateId, validate, getAdminVendorDetails);

// Get my vendor profile - must be authenticated
router.get('/me/profile', authenticate, getMyVendorProfile);
router.get('/slug/:slug', getVendorBySlug);
router.get('/:id', validateId, validate, getVendor);
router.put('/:id', authenticate, validateId, validate, updateVendor);
router.put('/:id/admin-profile', authenticate, isAdmin, validateId, adminVendorUpdateValidation, validate, adminUpdateVendorProfile);
router.put('/:id/status', authenticate, isAdmin, validateId, vendorStatusValidation, validate, updateVendorStatus);
router.post('/:id/documents', authenticate, validateId, uploadDocument.single('document'), vendorDocumentValidation, validate, uploadVendorDocument);
router.get('/:id/documents', authenticate, isAdmin, validateId, paginationValidation, validate, getVendorDocuments);
router.put('/:id/documents/:docId/review', authenticate, isAdmin, validateId, validateDocumentId, vendorDocumentReviewValidation, validate, reviewVendorDocument);
router.post('/:id/compliance-checks', authenticate, isAdmin, validateId, vendorComplianceValidation, validate, addComplianceCheck);
router.get('/:id/activity-logs', authenticate, isAdmin, validateId, paginationValidation, validate, getVendorActivityLogs);
router.get('/:id/performance', authenticate, isAdmin, validateId, validate, getVendorPerformanceOverview);
router.get('/:id/analytics', authenticate, validateId, validate, getVendorAnalytics);
router.put('/:id/approve', authenticate, isAdmin, validateId, validate, approveVendor);
router.put('/:id/reject', authenticate, isAdmin, validateId, validate, rejectVendor);

module.exports = router;
