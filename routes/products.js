const express = require('express');
const { query } = require('express-validator');
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
  getFeaturedProducts,
  searchProducts,
  getTrendingProducts
} = require('../controllers/productController');
const { getNewArrivals, getSimilarProducts } = require('../controllers/productDiscoveryController');
const { getProductReviewsByProduct } = require('../controllers/reviewController');
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
router.get(
  '/search',
  paginationValidation,
  query('q').optional().isString().trim().isLength({ max: 120 }).withMessage('q cannot exceed 120 chars'),
  query('minPrice').optional().isFloat({ min: 0 }).withMessage('minPrice must be a non-negative number'),
  query('maxPrice').optional().isFloat({ min: 0 }).withMessage('maxPrice must be a non-negative number'),
  query('sort').optional().isIn(['relevance', 'price_asc', 'price_desc', 'newest', 'rating_desc', 'best_selling']).withMessage('Invalid sort'),
  validate,
  searchProducts
);
router.get('/featured', getFeaturedProducts);
router.get('/new', paginationValidation, validate, getNewArrivals);
router.get(
  '/trending',
  paginationValidation,
  query('range').optional().isIn(['7d', '30d']).withMessage('range must be 7d or 30d'),
  validate,
  getTrendingProducts
);
router.get('/slug/:slug', getProductBySlug);
router.get('/:productId/similar', validateProductId, validate, getSimilarProducts);
router.get('/vendor/:vendorId', validateVendorId, validate, paginationValidation, validate, getVendorProducts);
router.get('/:productId/reviews', validateProductId, validate, paginationValidation, validate, getProductReviewsByProduct);
router.get('/:productId/history', authenticate, validateProductId, validate, getProductHistory);
router.get('/:id', validateId, validate, getProduct);
router.delete('/:id', authenticate, isVendor, requireActiveVendorAccount, validateId, validate, deleteProduct);
router.post('/:id/report', authenticate, validateId, productReportValidation, validate, reportProduct);
router.put('/:id/moderate', authenticate, isAdmin, validateId, productModerationValidation, validate, moderateProduct);

module.exports = router;
