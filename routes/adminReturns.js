const express = require('express');
const { authenticate, isAdmin } = require('../middleware/auth');
const { listReturnRequests, updateReturnRequest } = require('../controllers/returnRequestAdminController');

const router = express.Router();
router.get('/returns', authenticate, isAdmin, listReturnRequests);
router.patch('/returns/:id', authenticate, isAdmin, updateReturnRequest);

module.exports = router;
