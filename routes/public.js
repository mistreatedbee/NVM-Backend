const express = require('express');
const router = express.Router();
const { getPublicVendorProducts } = require('../controllers/productController');

router.get('/vendors/:vendorId/products', getPublicVendorProducts);

module.exports = router;
