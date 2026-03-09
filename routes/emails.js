const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/auth');
const { listTemplateCatalog, sendTestTemplate, sendQuickVerificationTest } = require('../controllers/emailController');

router.get('/templates', authenticate, isAdmin, listTemplateCatalog);
router.post('/test', authenticate, isAdmin, sendTestTemplate);
router.post('/test/verification', authenticate, isAdmin, sendQuickVerificationTest);

module.exports = router;
