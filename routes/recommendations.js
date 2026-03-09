const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getRecommendations } = require('../controllers/recommendationController');

const router = express.Router();
router.get('/', authenticate, getRecommendations);

module.exports = router;
