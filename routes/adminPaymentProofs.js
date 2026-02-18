const express = require('express');
const { authenticate, isAdmin } = require('../middleware/auth');
const {
  getAdminPaymentProofs,
  approvePaymentProof,
  rejectPaymentProof
} = require('../controllers/paymentProofController');

const router = express.Router();

router.get('/payment-proofs', authenticate, isAdmin, getAdminPaymentProofs);
router.patch('/payment-proofs/:proofId/approve', authenticate, isAdmin, approvePaymentProof);
router.patch('/payment-proofs/:proofId/reject', authenticate, isAdmin, rejectPaymentProof);

module.exports = router;
