const express = require('express');
const router = express.Router();
const {
  createConversation,
  getConversations,
  getConversationById,
  postMessage,
  getMessages,
  markMessageAsRead,
  chatbotMessage,
  escalateChat,
  getUserChats,
  getChatById,
  createChat
} = require('../controllers/chatController');
const { authenticate } = require('../middleware/auth');

router.post('/conversations', authenticate, createConversation);
router.get('/conversations', authenticate, getConversations);
router.get('/conversations/:id', authenticate, getConversationById);

router.post('/messages', authenticate, postMessage);
router.get('/messages', authenticate, getMessages);
router.patch('/messages/:id/read', authenticate, markMessageAsRead);

router.post('/chatbot/message', authenticate, chatbotMessage);
router.post('/escalate', authenticate, escalateChat);

router.get('/', authenticate, getUserChats);
router.get('/:id', authenticate, getChatById);
router.post('/', authenticate, createChat);

module.exports = router;
