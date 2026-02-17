const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/auth');
const { validate, paginationValidation, validateProductId } = require('../middleware/validator');
const {
  getAdminProducts,
  getAdminProductById,
  approveProduct,
  rejectProduct,
  adminUnpublishProduct,
  adminRepublishProduct
} = require('../controllers/productController');

router.use(authenticate, isAdmin);

router.get('/products', paginationValidation, validate, getAdminProducts);
router.get('/products/:productId', validateProductId, validate, getAdminProductById);
router.patch('/products/:productId/approve', validateProductId, validate, approveProduct);
router.patch(
  '/products/:productId/reject',
  validateProductId,
  body('reason').trim().notEmpty().withMessage('reason is required'),
  validate,
  rejectProduct
);
router.patch('/products/:productId/unpublish', validateProductId, validate, adminUnpublishProduct);
router.patch('/products/:productId/republish', validateProductId, validate, adminRepublishProduct);

module.exports = router;
