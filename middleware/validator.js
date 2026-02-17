const { body, param, query, validationResult } = require('express-validator');

// Validation middleware
exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Registration validation
exports.registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role')
    .optional()
    .isIn(['customer', 'vendor']).withMessage('Invalid role')
];

// Login validation
exports.loginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
];

// Product validation
exports.productValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Product name is required')
    .isLength({ max: 200 }).withMessage('Product name cannot exceed 200 characters'),
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ max: 5000 }).withMessage('Description cannot exceed 5000 characters'),
  body('price')
    .notEmpty().withMessage('Price is required')
    .isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('category')
    .notEmpty().withMessage('Category is required'),
  body('productType')
    .notEmpty().withMessage('Product type is required')
    .isIn(['physical', 'digital', 'service']).withMessage('Invalid product type')
];

exports.productReportValidation = [
  body('reason')
    .notEmpty().withMessage('Report reason is required')
    .isIn(['counterfeit', 'misleading', 'prohibited', 'pricing', 'abuse', 'other'])
    .withMessage('Invalid report reason'),
  body('details')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Report details cannot exceed 500 characters')
];

exports.productModerationValidation = [
  body('action')
    .notEmpty().withMessage('Moderation action is required')
    .isIn(['approve', 'reject', 'resolve-reports', 'dismiss-reports'])
    .withMessage('Invalid moderation action'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Reason cannot exceed 500 characters')
];

// Vendor validation
exports.vendorValidation = [
  body('storeName')
    .trim()
    .notEmpty().withMessage('Store name is required')
    .isLength({ max: 100 }).withMessage('Store name cannot exceed 100 characters'),
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters'),
  body('category')
    .notEmpty().withMessage('Category is required'),
  body('businessType')
    .optional()
    .isIn(['individual', 'business', 'freelancer']).withMessage('Invalid business type'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email'),
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone is required'),
  body('address.street')
    .trim()
    .notEmpty().withMessage('Street address is required'),
  body('address.city')
    .trim()
    .notEmpty().withMessage('City is required'),
  body('address.state')
    .trim()
    .notEmpty().withMessage('State is required'),
  body('address.country')
    .trim()
    .notEmpty().withMessage('Country is required'),
  body('address.zipCode')
    .trim()
    .notEmpty().withMessage('Zip code is required'),
  // Banking details (optional but validated if provided)
  body('bankDetails.accountHolderName')
    .optional()
    .trim()
    .notEmpty().withMessage('Account holder name is required')
    .isLength({ max: 100 }).withMessage('Account holder name cannot exceed 100 characters'),
  body('bankDetails.bankName')
    .optional()
    .trim()
    .notEmpty().withMessage('Bank name is required'),
  body('bankDetails.accountNumber')
    .optional()
    .trim()
    .notEmpty().withMessage('Account number is required')
    .isNumeric().withMessage('Account number must contain only numbers'),
  body('bankDetails.branchCode')
    .optional()
    .trim()
    .notEmpty().withMessage('Branch code is required')
    .isLength({ min: 6, max: 6 }).withMessage('Branch code must be exactly 6 digits')
    .isNumeric().withMessage('Branch code must contain only numbers'),
  body('bankDetails.accountType')
    .optional()
    .isIn(['savings', 'current', 'business']).withMessage('Invalid account type'),
  // Social media (optional)
  body('socialMedia.facebook')
    .optional()
    .trim(),
  body('socialMedia.instagram')
    .optional()
    .trim(),
  body('socialMedia.twitter')
    .optional()
    .trim()
];

exports.vendorStatusValidation = [
  body('accountStatus')
    .notEmpty().withMessage('Account status is required')
    .isIn(['active', 'pending', 'suspended', 'banned']).withMessage('Invalid account status'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Reason cannot exceed 500 characters')
];

exports.adminVendorUpdateValidation = [
  body('storeName').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Store name must be between 2 and 100 characters'),
  body('description').optional().trim().isLength({ min: 5, max: 1000 }).withMessage('Description must be between 5 and 1000 characters'),
  body('category').optional().isIn(['fashion', 'electronics', 'food', 'services', 'health', 'beauty', 'home', 'sports', 'books', 'art', 'other']).withMessage('Invalid category'),
  body('businessType').optional().isIn(['individual', 'business', 'freelancer']).withMessage('Invalid business type'),
  body('email').optional().trim().isEmail().withMessage('Please provide a valid email'),
  body('phone').optional().trim().notEmpty().withMessage('Phone cannot be empty'),
  body('website').optional().trim(),
  body('address').optional().isObject().withMessage('Address must be an object'),
  body('socialMedia').optional().isObject().withMessage('Social media must be an object'),
  body('bankDetails').optional().isObject().withMessage('Bank details must be an object'),
  body('settings').optional().isObject().withMessage('Settings must be an object')
];

exports.vendorDocumentValidation = [
  body('type')
    .notEmpty().withMessage('Document type is required')
    .isIn(['business-registration', 'tax-certificate', 'compliance', 'identity', 'bank-proof', 'other'])
    .withMessage('Invalid document type'),
  body('name')
    .trim()
    .notEmpty().withMessage('Document name is required')
    .isLength({ max: 150 }).withMessage('Document name cannot exceed 150 characters'),
  body('url')
    .optional()
    .trim()
    .isURL().withMessage('Document URL must be valid'),
  body('expiresAt')
    .optional()
    .isISO8601().withMessage('Expiration date must be a valid ISO date')
];

exports.vendorDocumentReviewValidation = [
  body('action')
    .notEmpty().withMessage('Review action is required')
    .isIn(['verify', 'reject']).withMessage('Invalid action'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Reason cannot exceed 500 characters')
];

exports.vendorComplianceValidation = [
  body('checkType')
    .notEmpty().withMessage('Compliance check type is required')
    .isIn(['kyc', 'business-license', 'tax', 'banking', 'policy', 'other'])
    .withMessage('Invalid compliance check type'),
  body('status')
    .notEmpty().withMessage('Compliance status is required')
    .isIn(['pending', 'passed', 'failed']).withMessage('Invalid compliance status'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters'),
  body('nextReviewAt')
    .optional()
    .isISO8601().withMessage('Next review date must be a valid ISO date')
];

// Review validation
exports.reviewValidation = [
  body('targetType')
    .optional()
    .isIn(['PRODUCT', 'VENDOR']).withMessage('targetType must be PRODUCT or VENDOR'),
  body('productId')
    .optional()
    .isMongoId().withMessage('Invalid productId'),
  body('vendorId')
    .optional()
    .isMongoId().withMessage('Invalid vendorId'),
  body('orderId')
    .optional()
    .isMongoId().withMessage('Invalid orderId'),
  body('product')
    .optional()
    .isMongoId().withMessage('Invalid product ID'),
  body('vendor')
    .optional()
    .isMongoId().withMessage('Invalid vendor ID'),
  body('order')
    .optional()
    .isMongoId().withMessage('Invalid order ID'),
  body('rating')
    .notEmpty().withMessage('Rating is required')
    .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('title')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Title cannot exceed 100 characters'),
  body('body')
    .optional()
    .trim()
    .isLength({ min: 10, max: 2000 }).withMessage('Body must be 10..2000 characters'),
  body('comment')
    .trim()
    .optional()
    .notEmpty().withMessage('Comment is required')
    .isLength({ max: 2000 }).withMessage('Comment cannot exceed 2000 characters'),
  body().custom((value) => {
    const bodyText = value?.body || value?.comment;
    if (!bodyText || !String(bodyText).trim()) {
      throw new Error('body is required');
    }
    return true;
  }),
  body('media')
    .optional()
    .isArray({ max: 5 }).withMessage('You can upload up to 5 media items'),
  body('media.*.url')
    .optional()
    .isString().withMessage('Media URL must be a string'),
  body('media.*.type')
    .optional()
    .isIn(['IMAGE', 'VIDEO']).withMessage('Media type must be IMAGE or VIDEO'),
  body('images')
    .optional()
    .isArray({ max: 10 }).withMessage('You can upload up to 10 images'),
  body('videos')
    .optional()
    .isArray({ max: 3 }).withMessage('You can upload up to 3 videos')
];

exports.reviewResponseValidation = [
  body('comment')
    .trim()
    .notEmpty().withMessage('Response comment is required')
    .isLength({ max: 1000 }).withMessage('Response cannot exceed 1000 characters')
];

exports.reviewReportValidation = [
  body('reason')
    .notEmpty().withMessage('Report reason is required')
    .isIn(['spam', 'abuse', 'fake', 'off-topic', 'copyright', 'other'])
    .withMessage('Invalid report reason'),
  body('details')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Report details cannot exceed 500 characters')
];

exports.reviewModerationValidation = [
  body('action')
    .notEmpty().withMessage('Action is required')
    .isIn(['approve', 'reject', 'hide', 'restore', 'resolve-reports', 'dismiss-reports'])
    .withMessage('Invalid moderation action'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Reason cannot exceed 500 characters')
];

// Order validation
exports.orderValidation = [
  body('items')
    .isArray({ min: 1 }).withMessage('Order must contain at least one item'),
  body('shippingAddress')
    .notEmpty().withMessage('Shipping address is required'),
  body('shippingAddress.fullName')
    .trim()
    .notEmpty().withMessage('Full name is required'),
  body('shippingAddress.phone')
    .trim()
    .notEmpty().withMessage('Phone is required'),
  body('shippingAddress.street')
    .trim()
    .notEmpty().withMessage('Street address is required'),
  body('shippingAddress.city')
    .trim()
    .notEmpty().withMessage('City is required'),
  body('shippingAddress.country')
    .trim()
    .notEmpty().withMessage('Country is required'),
  body('paymentMethod')
    .notEmpty().withMessage('Payment method is required')
    .isIn(['stripe', 'payfast', 'cash-on-delivery', 'eft', 'bank-transfer']).withMessage('Invalid payment method')
];

// MongoDB ID validation
exports.validateId = [
  param('id')
    .isMongoId().withMessage('Invalid ID format')
];

exports.validateDocumentId = [
  param('docId')
    .isMongoId().withMessage('Invalid document ID format')
];

exports.validateProductId = [
  param('productId')
    .isMongoId().withMessage('Invalid product ID format')
];

// Pagination validation
exports.paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

exports.vendorProfileValidation = [
  body('storeName')
    .trim()
    .notEmpty().withMessage('Store name is required')
    .isLength({ max: 100 }).withMessage('Store name cannot exceed 100 characters'),
  body('usernameSlug')
    .optional()
    .trim()
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Slug must be URL-safe (lowercase letters, numbers, hyphens)'),
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Bio cannot exceed 1000 characters'),
  body('about')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('About cannot exceed 2000 characters'),
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Please provide a valid email'),
  body('location')
    .optional()
    .isObject().withMessage('Location must be an object'),
  body('location.country')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Country cannot exceed 100 characters'),
  body('location.state')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('State cannot exceed 100 characters'),
  body('location.city')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('City cannot exceed 100 characters'),
  body('bankDetails.bankName')
    .optional()
    .trim()
    .isLength({ max: 120 }).withMessage('Bank name cannot exceed 120 characters'),
  body('bankDetails.accountHolder')
    .optional()
    .trim()
    .isLength({ max: 120 }).withMessage('Account holder cannot exceed 120 characters'),
  body('bankDetails.accountNumber')
    .optional()
    .trim()
    .isLength({ max: 40 }).withMessage('Account number cannot exceed 40 characters'),
  body('bankDetails.branchCode')
    .optional()
    .trim()
    .isLength({ max: 20 }).withMessage('Branch code cannot exceed 20 characters'),
  body('bankDetails.accountType')
    .optional()
    .isIn(['savings', 'current', 'business']).withMessage('Invalid account type'),
  body('bankDetails.payoutEmail')
    .optional()
    .trim()
    .isEmail().withMessage('Invalid payout email'),
  body('bankDetails.payoutReference')
    .optional()
    .trim()
    .isLength({ max: 120 }).withMessage('Payout reference cannot exceed 120 characters'),
  body('privacy.showPhone')
    .optional()
    .isBoolean().withMessage('showPhone must be true/false'),
  body('privacy.showEmail')
    .optional()
    .isBoolean().withMessage('showEmail must be true/false')
];

exports.validateVendorId = [
  param('vendorId')
    .isMongoId().withMessage('Invalid vendor ID format')
];
