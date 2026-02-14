const { sendTemplate } = require('../services/emailService');
const { listTemplates } = require('../emails/templates');

function randomOrderId() {
  return `NVM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

exports.listTemplateCatalog = async (_req, res, next) => {
  try {
    res.status(200).json({ success: true, data: listTemplates() });
  } catch (error) {
    next(error);
  }
};

exports.sendTestTemplate = async (req, res, next) => {
  try {
    const { to, templateName, variables = {} } = req.body;

    if (!to || !templateName) {
      return res.status(400).json({ success: false, message: 'to and templateName are required' });
    }

    const result = await sendTemplate(templateName, to, {
      userName: variables.userName || 'Test User',
      vendorName: variables.vendorName || 'Test Vendor',
      orderId: variables.orderId || randomOrderId(),
      actionUrl: variables.actionUrl || `${process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173'}/orders`,
      supportEmail: variables.supportEmail || process.env.SUPPORT_EMAIL || 'support@nvm.local',
      ...variables
    }, {
      event: 'email.test',
      initiatedBy: req.user?.id || null
    });

    res.status(200).json({
      success: true,
      message: 'Test email sent',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

exports.sendQuickVerificationTest = async (req, res, next) => {
  try {
    const { to } = req.body;
    if (!to) {
      return res.status(400).json({ success: false, message: 'to is required' });
    }

    const result = await sendTemplate('email_verification', to, {
      userName: 'Verification Tester',
      actionUrl: `${process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=test-token`
    }, {
      event: 'email.test.verification',
      initiatedBy: req.user?.id || null
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
