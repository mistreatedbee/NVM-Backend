const express = require('express');
const router = express.Router();
const { generateInvoice, getInvoiceData } = require('../controllers/invoiceController');
const { authenticate } = require('../middleware/auth');
const { validateId, validate } = require('../middleware/validator');

router.get('/:orderId', authenticate, validateId, validate, generateInvoice);
router.get('/:orderId/data', authenticate, validateId, validate, getInvoiceData);

module.exports = router;

