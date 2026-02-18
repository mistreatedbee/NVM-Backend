const express = require('express');
const { authenticate } = require('../middleware/auth');
const { applyPromoCode, redeemGiftCard } = require('../controllers/checkoutController');

const router = express.Router();

router.post('/promo/apply', authenticate, applyPromoCode);
router.post('/gift-card/redeem', authenticate, redeemGiftCard);

module.exports = router;
