const express = require('express');
const router = express.Router();
const {
  createProduct,
  getMyProducts,
  getAdminProducts,
  getAllProducts,
  getProduct,
  getProductBySlug,
  updateProduct,
  deleteProduct,
  reportProduct,
  getReportedProducts,
  moderateProduct,
  getProductAuditTrail,
  getVendorProducts,
  getFeaturedProducts
} = require('../controllers/productController');
const { authenticate, isVendor, isAdmin } = require('../middleware/auth');
const {
  productValidation,
  productReportValidation,
  productModerationValidation,
  validateId,
  validate,
  paginationValidation
} = require('../middleware/validator');

router.post('/', authenticate, isVendor, productValidation, validate, createProduct);
router.get('/my', authenticate, isVendor, paginationValidation, validate, getMyProducts);
router.get('/admin', authenticate, isAdmin, paginationValidation, validate, getAdminProducts);
router.get('/admin/reported', authenticate, isAdmin, paginationValidation, validate, getReportedProducts);
router.get('/', paginationValidation, validate, getAllProducts);
router.get('/featured', getFeaturedProducts);
router.get('/slug/:slug', getProductBySlug);
router.get('/vendor/:vendorId', validateId, validate, paginationValidation, validate, getVendorProducts);
router.get('/:id/audit', authenticate, isAdmin, validateId, validate, getProductAuditTrail);
router.get('/:id', validateId, validate, getProduct);
router.put('/:id', authenticate, isVendor, validateId, validate, updateProduct);
router.delete('/:id', authenticate, isVendor, validateId, validate, deleteProduct);
router.post('/:id/report', authenticate, validateId, productReportValidation, validate, reportProduct);
router.put('/:id/moderate', authenticate, isAdmin, validateId, productModerationValidation, validate, moderateProduct);

module.exports = router;
