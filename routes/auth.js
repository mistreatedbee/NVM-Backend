const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const {
  register,
  login,
  getMe,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  updateProfile
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many verification requests. Try again later.' }
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many password reset requests. Try again later.' }
});

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, getMe);
router.post('/verify-email', verifyEmail);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerificationLimiter, resendVerification);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPassword);
router.put('/reset-password/:token', resetPassword);
router.put('/profile', authenticate, updateProfile);

module.exports = router;

