const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const {
  getAdminZones,
  createZone,
  updateZone,
  activateZone,
  reorderZones,
  listAdminPickupPoints,
  createPickupPoint,
  updatePickupPoint,
  deletePickupPoint
} = require('../controllers/logisticsController');

router.use(authenticate, requireRole('ADMIN'));

router.get('/logistics/zones', getAdminZones);
router.post('/logistics/zones', createZone);
router.put('/logistics/zones/:id', updateZone);
router.patch('/logistics/zones/:id/activate', activateZone);
router.patch('/logistics/zones/reorder', reorderZones);

router.get('/pickup-points', listAdminPickupPoints);
router.post('/pickup-points', createPickupPoint);
router.put('/pickup-points/:id', updatePickupPoint);
router.delete('/pickup-points/:id', deletePickupPoint);

module.exports = router;
