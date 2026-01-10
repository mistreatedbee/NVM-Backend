const express = require('express');
const router = express.Router();
const {
  createProduct,
  getAllProducts,
  getProduct,
  getProductBySlug,
  updateProduct,
  deleteProduct,
  getVendorProducts,
  getFeaturedProducts
} = require('../controllers/productController');
const { authenticate, isVendor } = require('../middleware/auth');
const { productValidation, validateId, validate, paginationValidation } = require('../middleware/validator');

router.post('/', authenticate, isVendor, productValidation, validate, createProduct);
router.get('/', paginationValidation, validate, getAllProducts);
router.get('/featured', getFeaturedProducts);
router.get('/slug/:slug', getProductBySlug);
router.get('/vendor/:vendorId', validateId, validate, paginationValidation, validate, getVendorProducts);
router.get('/:id', validateId, validate, getProduct);
router.put('/:id', authenticate, isVendor, validateId, validate, updateProduct);
router.delete('/:id', authenticate, isVendor, validateId, validate, deleteProduct);

module.exports = router;
