const express = require('express');
const router = express.Router();
const { authenticate, isVendor, requireVerifiedEmail } = require('../middleware/auth');
const { requireActiveVendorAccount } = require('../middleware/requireActiveVendorAccount');
const { productValidation, validate, paginationValidation, validateProductId } = require('../middleware/validator');
const {
  createProduct,
  getMyProducts,
  getVendorProductById,
  updateProduct,
  submitProductForReview,
  vendorUnpublishProduct,
  vendorRepublishProduct
} = require('../controllers/productController');
const { enforceVendorPlanLimits } = require('../controllers/monetizationController');

const VENDOR_CAN_UNPUBLISH = String(process.env.VENDOR_CAN_UNPUBLISH || 'false').toLowerCase() === 'true';
const VENDOR_CAN_REPUBLISH = String(process.env.VENDOR_CAN_REPUBLISH || 'false').toLowerCase() === 'true';

router.use(authenticate, isVendor, requireActiveVendorAccount);

// Read operations: no email verification required so vendor dashboard loads
router.get('/products', paginationValidation, validate, getMyProducts);
router.get('/products/:productId', validateProductId, validate, getVendorProductById);

// Write operations: require verified email
router.post('/products', requireVerifiedEmail, enforceVendorPlanLimits, productValidation, validate, createProduct);
router.put('/products/:productId', requireVerifiedEmail, validateProductId, validate, updateProduct);
router.post('/products/:productId/submit', requireVerifiedEmail, validateProductId, validate, submitProductForReview);
if (VENDOR_CAN_UNPUBLISH) {
  router.patch('/products/:productId/unpublish', requireVerifiedEmail, validateProductId, validate, vendorUnpublishProduct);
}
if (VENDOR_CAN_REPUBLISH) {
  router.patch('/products/:productId/publish', requireVerifiedEmail, validateProductId, validate, vendorRepublishProduct);
}

module.exports = router;
