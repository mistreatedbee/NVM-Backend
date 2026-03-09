const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  applyPromoCode,
  redeemGiftCard,
  getCheckoutPreview
} = require('../controllers/checkoutController');

const router = express.Router();

router.post('/promo/apply', authenticate, applyPromoCode);
router.post('/gift-card/redeem', authenticate, redeemGiftCard);
router.post('/preview', authenticate, getCheckoutPreview);

module.exports = router;
