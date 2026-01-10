const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
};

// Send email
exports.sendEmail = async (options) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"Ndingoho Vendor Markets" <${process.env.EMAIL_USER}>`,
      to: options.email,
      subject: options.subject,
      html: options.html || options.text
    };

    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully');
  } catch (error) {
    console.error('Email error:', error);
    throw new Error('Email could not be sent');
  }
};

// Email templates
exports.welcomeEmail = (name) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; background: #f9f9f9; }
        .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to NVM! 🎉</h1>
        </div>
        <div class="content">
          <h2>Hello ${name},</h2>
          <p>Thank you for joining Ndingoho Vendor Markets - Your Marketplace for Every Business.</p>
          <p>We're excited to have you on board! Start exploring thousands of products from amazing vendors.</p>
          <a href="${process.env.FRONTEND_URL}" class="button">Start Shopping</a>
          <p>If you have any questions, feel free to reach out to our support team.</p>
          <p>Best regards,<br>The NVM Team</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

exports.vendorApprovalEmail = (vendorName, storeName) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; background: #f9f9f9; }
        .button { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎊 Vendor Application Approved!</h1>
        </div>
        <div class="content">
          <h2>Congratulations ${vendorName}!</h2>
          <p>Your vendor application for <strong>${storeName}</strong> has been approved.</p>
          <p>You can now start listing your products and selling on NVM marketplace.</p>
          <a href="${process.env.FRONTEND_URL}/vendor/dashboard" class="button">Go to Dashboard</a>
          <p>Welcome to the NVM vendor community!</p>
          <p>Best regards,<br>The NVM Team</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

exports.orderConfirmationEmail = (customerName, orderNumber, total) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; background: #f9f9f9; }
        .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .order-info { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Order Confirmed! ✅</h1>
        </div>
        <div class="content">
          <h2>Thank you ${customerName}!</h2>
          <p>Your order has been confirmed and is being processed.</p>
          <div class="order-info">
            <p><strong>Order Number:</strong> ${orderNumber}</p>
            <p><strong>Total Amount:</strong> $${total}</p>
          </div>
          <a href="${process.env.FRONTEND_URL}/customer/orders/${orderNumber}" class="button">Track Order</a>
          <p>You'll receive another email when your order ships.</p>
          <p>Best regards,<br>The NVM Team</p>
        </div>
      </div>
    </body>
    </html>
  `;
};
