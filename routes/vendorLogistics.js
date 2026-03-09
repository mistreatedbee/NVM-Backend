const express = require('express');
const router = express.Router();
const { authenticate, requireRole, requireVendorActive } = require('../middleware/auth');
const {
  getVendorLogisticsSettings,
  updateVendorLogisticsSettings,
  createPickupPoint,
  updatePickupPoint,
  deletePickupPoint,
  listMyVendorPickupPoints
} = require('../controllers/logisticsController');

router.use(authenticate, requireRole('VENDOR', 'ADMIN'));

router.get('/logistics/settings', getVendorLogisticsSettings);
router.put('/logistics/settings', requireVendorActive, updateVendorLogisticsSettings);

router.get('/pickup-points', listMyVendorPickupPoints);
router.post('/pickup-points', requireVendorActive, createPickupPoint);
router.put('/pickup-points/:id', requireVendorActive, updatePickupPoint);
router.delete('/pickup-points/:id', requireVendorActive, deletePickupPoint);

module.exports = router;
