const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getWishlist,
  addWishlistItem,
  removeWishlistItem,
  toggleWishlistItem,
  getWishlistCount
} = require('../controllers/wishlistController');

const router = express.Router();

router.use(authenticate);

router.get('/', getWishlist);
router.post('/add', addWishlistItem);
router.post('/remove', removeWishlistItem);
router.post('/toggle', toggleWishlistItem);
router.get('/count', getWishlistCount);

module.exports = router;
