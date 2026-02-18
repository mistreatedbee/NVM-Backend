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

router.use(authenticate, isVendor, requireVerifiedEmail, requireActiveVendorAccount);

router.post('/products', enforceVendorPlanLimits, productValidation, validate, createProduct);
router.get('/products', paginationValidation, validate, getMyProducts);
router.get('/products/:productId', validateProductId, validate, getVendorProductById);
router.put('/products/:productId', validateProductId, validate, updateProduct);
router.post('/products/:productId/submit', validateProductId, validate, submitProductForReview);
if (VENDOR_CAN_UNPUBLISH) {
  router.patch('/products/:productId/unpublish', validateProductId, validate, vendorUnpublishProduct);
}
if (VENDOR_CAN_REPUBLISH) {
  router.patch('/products/:productId/publish', validateProductId, validate, vendorRepublishProduct);
}

module.exports = router;
