const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  listAlerts,
  createAlert,
  deactivateAlert
} = require('../controllers/alertSubscriptionController');

const router = express.Router();
router.use(authenticate);

router.get('/', listAlerts);
router.post('/', createAlert);
router.delete('/:id', deactivateAlert);

module.exports = router;
