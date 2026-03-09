const express = require('express');
const router = express.Router();
const { authenticate, isVendor } = require('../middleware/auth');
const uploadDocument = require('../middleware/uploadDocument');
const { validate, validateDocumentId } = require('../middleware/validator');
const { requireActiveVendorAccount } = require('../middleware/requireActiveVendorAccount');
const {
  uploadVendorDocument,
  getVendorDocuments,
  deleteVendorDocument,
  getVendorMetrics
} = require('../controllers/vendorAdminController');

router.use(authenticate, isVendor);

router.post('/documents', requireActiveVendorAccount, uploadDocument.single('file'), uploadVendorDocument);
router.get('/documents', getVendorDocuments);
router.delete('/documents/:docId', validateDocumentId, validate, deleteVendorDocument);
router.get('/metrics', getVendorMetrics);

module.exports = router;
