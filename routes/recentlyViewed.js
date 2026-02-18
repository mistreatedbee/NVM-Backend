const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getRecentlyViewed,
  trackRecentlyViewed
} = require('../controllers/recentlyViewedController');

const router = express.Router();

router.use(authenticate);

router.get('/', getRecentlyViewed);
router.post('/track', trackRecentlyViewed);

module.exports = router;
