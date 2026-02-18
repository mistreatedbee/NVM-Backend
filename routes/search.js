const express = require('express');
const router = express.Router();
const {
  saveSearch,
  getSearchHistory,
  getPopularSearches,
  clearSearchHistory,
  generateRecommendations,
  getRecommendations,
  trackRecommendationClick,
  searchProductsDiscovery,
  autocomplete
} = require('../controllers/searchController');
const { authenticate } = require('../middleware/auth');
const { validateId, validate } = require('../middleware/validator');
const { searchLimiter } = require('../middleware/security');

// Search history
router.get('/products', searchLimiter, searchProductsDiscovery);
router.get('/autocomplete', searchLimiter, autocomplete);
router.post('/history', authenticate, saveSearch);
router.get('/history', authenticate, getSearchHistory);
router.delete('/history', authenticate, clearSearchHistory);
router.get('/popular', getPopularSearches);

// Recommendations
router.post('/recommendations/generate', authenticate, generateRecommendations);
router.get('/recommendations', authenticate, getRecommendations);
router.put('/recommendations/:id/click', authenticate, validateId, validate, trackRecommendationClick);

module.exports = router;

