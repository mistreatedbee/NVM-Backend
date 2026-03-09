const express = require('express');
const { authenticate, isVendor } = require('../middleware/auth');
const { createQuestion, getQuestions, answerQuestion } = require('../controllers/productQaController');

const router = express.Router();

router.post('/products/:productId/questions', authenticate, createQuestion);
router.get('/products/:productId/questions', getQuestions);
router.post('/vendor/questions/:questionId/answer', authenticate, isVendor, answerQuestion);

module.exports = router;
