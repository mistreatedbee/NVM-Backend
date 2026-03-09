const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/auth');
const {
  getAdminInvoices,
  getAdminInvoiceById,
  regenerateAdminInvoicePdf,
  voidInvoice
} = require('../controllers/invoiceController');
const { getAdminVendorTransactions } = require('../controllers/financeController');

router.get('/invoices', authenticate, isAdmin, getAdminInvoices);
router.get('/invoices/:invoiceId', authenticate, isAdmin, getAdminInvoiceById);
router.post('/invoices/:invoiceId/regenerate-pdf', authenticate, isAdmin, regenerateAdminInvoicePdf);
router.patch('/invoices/:invoiceId/void', authenticate, isAdmin, voidInvoice);
router.get('/vendors/:vendorId/transactions', authenticate, isAdmin, getAdminVendorTransactions);

module.exports = router;
