const express = require('express');
const router = express.Router();
const { sendTemplate } = require('../services/emailService');
const { buildAppUrl } = require('../utils/appUrl');

router.get('/send-test-email', async (req, res, next) => {
  try {
    if (String(process.env.EMAIL_DEBUG_ENABLED || '').toLowerCase() !== 'true') {
      return res.status(404).json({ success: false, message: 'Debug email route disabled' });
    }

    const expectedToken = process.env.EMAIL_DEBUG_TOKEN;
    const providedToken = req.query.token || req.header('x-debug-token');
    if (expectedToken && providedToken !== expectedToken) {
      return res.status(401).json({ success: false, message: 'Unauthorized debug token' });
    }

    const to = String(req.query.to || '').trim().toLowerCase();
    if (!to) {
      return res.status(400).json({ success: false, message: 'Query param "to" is required' });
    }

    const result = await sendTemplate('email_verification', to, {
      userName: 'Render Debug',
      actionUrl: buildAppUrl('/verify-email?token=debug-token'),
      supportEmail: process.env.SUPPORT_EMAIL
    }, {
      event: 'email.debug.send-test-email'
    });

    res.status(200).json({
      success: true,
      message: 'Test email sent',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
