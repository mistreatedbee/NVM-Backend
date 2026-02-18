const express = require('express');
const router = express.Router();
const { getLogisticsQuote } = require('../controllers/logisticsController');

router.post('/quote', getLogisticsQuote);

module.exports = router;
