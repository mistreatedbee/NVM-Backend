const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
  mergeCart
} = require('../controllers/cartController');

const router = express.Router();

router.use(authenticate);

router.get('/', getCart);
router.post('/add', addCartItem);
router.post('/update', updateCartItem);
router.post('/remove', removeCartItem);
router.post('/clear', clearCart);
router.post('/merge', mergeCart);

module.exports = router;
