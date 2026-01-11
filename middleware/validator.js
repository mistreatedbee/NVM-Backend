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

// Review validation
exports.reviewValidation = [
  body('rating')
    .notEmpty().withMessage('Rating is required')
    .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment')
    .trim()
    .notEmpty().withMessage('Comment is required')
    .isLength({ max: 1000 }).withMessage('Comment cannot exceed 1000 characters')
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
    .isIn(['stripe', 'payfast', 'cash-on-delivery']).withMessage('Invalid payment method')
];

// MongoDB ID validation
exports.validateId = [
  param('id')
    .isMongoId().withMessage('Invalid ID format')
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
