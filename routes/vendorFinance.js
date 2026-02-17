const express = require('express');
const router = express.Router();
const { authenticate, isVendor } = require('../middleware/auth');
const {
  getVendorInvoices,
  getVendorInvoiceById,
  downloadVendorInvoicePdf
} = require('../controllers/invoiceController');
const { getVendorTransactions } = require('../controllers/financeController');

router.get('/invoices', authenticate, isVendor, getVendorInvoices);
router.get('/invoices/:invoiceId', authenticate, isVendor, getVendorInvoiceById);
router.get('/invoices/:invoiceId/pdf', authenticate, isVendor, downloadVendorInvoicePdf);
router.get('/transactions', authenticate, isVendor, getVendorTransactions);

module.exports = router;
