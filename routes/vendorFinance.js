const express = require('express');
const router = express.Router();
const { authenticate, isVendor } = require('../middleware/auth');
const { requireActiveVendorAccount } = require('../middleware/requireActiveVendorAccount');
const {
  getVendorInvoices,
  getVendorInvoiceById,
  downloadVendorInvoicePdf
} = require('../controllers/invoiceController');
const { getVendorTransactions } = require('../controllers/financeController');

router.get('/invoices', authenticate, isVendor, requireActiveVendorAccount, getVendorInvoices);
router.get('/invoices/:invoiceId', authenticate, isVendor, requireActiveVendorAccount, getVendorInvoiceById);
router.get('/invoices/:invoiceId/pdf', authenticate, isVendor, requireActiveVendorAccount, downloadVendorInvoicePdf);
router.get('/transactions', authenticate, isVendor, requireActiveVendorAccount, getVendorTransactions);

module.exports = router;
