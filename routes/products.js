const express = require('express');
const router = express.Router();
const {
  getAllProducts,
  getProduct,
  getProductBySlug,
  deleteProduct,
  reportProduct,
  getReportedProducts,
  moderateProduct,
  getProductHistory,
  getVendorProducts,
  getFeaturedProducts
} = require('../controllers/productController');
const { authenticate, isVendor, isAdmin, requireVerifiedEmail } = require('../middleware/auth');
const { requireActiveVendorAccount } = require('../middleware/requireActiveVendorAccount');
const {
  productValidation,
  productReportValidation,
  productModerationValidation,
  validateId,
  validateProductId,
  validateVendorId,
  validate,
  paginationValidation
} = require('../middleware/validator');

router.get('/admin/reported', authenticate, isAdmin, paginationValidation, validate, getReportedProducts);
router.get('/', paginationValidation, validate, getAllProducts);
router.get('/featured', getFeaturedProducts);
router.get('/slug/:slug', getProductBySlug);
router.get('/vendor/:vendorId', validateVendorId, validate, paginationValidation, validate, getVendorProducts);
router.get('/:productId/history', authenticate, validateProductId, validate, getProductHistory);
router.get('/:id', validateId, validate, getProduct);
router.delete('/:id', authenticate, isVendor, requireActiveVendorAccount, validateId, validate, deleteProduct);
router.post('/:id/report', authenticate, validateId, productReportValidation, validate, reportProduct);
router.put('/:id/moderate', authenticate, isAdmin, validateId, productModerationValidation, validate, moderateProduct);

module.exports = router;
