const express = require('express');
const router = express.Router();
const { getAll, getById, ban, unban, deleteUser, updateProfile } = require('../controllers/userController');
const { authenticate, isAdmin } = require('../middleware/auth');

router.get('/', authenticate, isAdmin, getAll);
router.get('/:id', authenticate, isAdmin, getById);
router.put('/:id/ban', authenticate, isAdmin, ban);
router.put('/:id/unban', authenticate, isAdmin, unban);
router.delete('/:id', authenticate, isAdmin, deleteUser);
router.put('/profile', authenticate, updateProfile);

module.exports = router;

