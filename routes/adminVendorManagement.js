const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/auth');
const { validate, validateVendorId, validateDocumentId, paginationValidation } = require('../middleware/validator');
const {
  getAdminVendors,
  getAdminVendorById,
  approveVendor,
  rejectVendor,
  suspendVendor,
  unsuspendVendor,
  adminEditVendorProfile,
  getAdminVendorDocuments,
  approveDocument,
  rejectDocument,
  getAdminVendorMetrics
} = require('../controllers/vendorAdminController');

router.use(authenticate, isAdmin);

router.get('/vendors', paginationValidation, validate, getAdminVendors);
router.get('/vendors/:vendorId', validateVendorId, validate, getAdminVendorById);
router.patch('/vendors/:vendorId/approve', validateVendorId, validate, approveVendor);
router.patch('/vendors/:vendorId/reject', validateVendorId, validate, rejectVendor);
router.patch('/vendors/:vendorId/suspend', validateVendorId, validate, suspendVendor);
router.patch('/vendors/:vendorId/unsuspend', validateVendorId, validate, unsuspendVendor);
router.patch('/vendors/:vendorId/profile', validateVendorId, validate, adminEditVendorProfile);

router.get('/vendors/:vendorId/documents', validateVendorId, paginationValidation, validate, getAdminVendorDocuments);
router.patch('/documents/:docId/approve', validateDocumentId, validate, approveDocument);
router.patch('/documents/:docId/reject', validateDocumentId, validate, rejectDocument);

router.get('/vendors/:vendorId/metrics', validateVendorId, validate, getAdminVendorMetrics);

module.exports = router;
