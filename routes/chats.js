const express = require('express');
const router = express.Router();
const { getUserChats, getChatById, createChat } = require('../controllers/chatController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, getUserChats);
router.get('/:id', authenticate, getChatById);
router.post('/', authenticate, createChat);

module.exports = router;

