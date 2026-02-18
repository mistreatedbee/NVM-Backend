const express = require('express');
const { authenticate } = require('../middleware/auth');
const { createReport, getMyReports } = require('../controllers/reportController');

const router = express.Router();

router.use(authenticate);
router.post('/', createReport);
router.get('/my', getMyReports);

module.exports = router;

