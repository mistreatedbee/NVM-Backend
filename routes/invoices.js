const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getMyInvoices,
  getMyInvoiceById,
  downloadMyInvoicePdf,
  generateInvoice,
  getInvoiceData
} = require('../controllers/invoiceController');

router.get('/my', authenticate, getMyInvoices);
router.get('/my/:invoiceId', authenticate, getMyInvoiceById);
router.get('/my/:invoiceId/pdf', authenticate, downloadMyInvoicePdf);

// Legacy compatibility routes by order id
router.get('/:orderId/data', authenticate, getInvoiceData);
router.get('/:orderId', authenticate, generateInvoice);

module.exports = router;
