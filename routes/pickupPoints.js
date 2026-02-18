const express = require('express');
const router = express.Router();
const { listNearbyPickupPoints } = require('../controllers/logisticsController');

router.get('/', listNearbyPickupPoints);

module.exports = router;
