const express = require('express');
const router = express.Router();
const {
  createPaymentIntent,
  confirmPayment,
  stripeWebhook,
  getPaymentMethods,
  requestRefund,
  initiatePayFastPayment,
  payfastITN,
  saveEftProof
} = require('../controllers/paymentController');
const { authenticate, isAdmin } = require('../middleware/auth');

router.post('/create-intent', authenticate, createPaymentIntent);
router.post('/payfast/initiate', authenticate, initiatePayFastPayment);
router.post('/payfast/itn', express.urlencoded({ extended: false }), payfastITN);
router.post('/eft/proof', authenticate, saveEftProof);
router.post('/confirm', authenticate, confirmPayment);
router.post('/webhook', express.raw({ type: 'application/json' }), stripeWebhook);
router.get('/methods', getPaymentMethods);
router.post('/refund', authenticate, isAdmin, requestRefund);

module.exports = router;
