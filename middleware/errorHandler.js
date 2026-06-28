// Friendly phrasing for duplicate-key violations, keyed by the schema
// field that collided. Most fields users can actually trigger themselves
// (email, codes, names); anything else falls back to a plain-English
// generic message rather than exposing the raw schema field name.
const DUPLICATE_FIELD_MESSAGES = {
  email: 'An account with this email already exists. Try logging in instead.',
  code: 'This code is already in use. Please try a different one.',
  name: 'This name is already taken. Please choose another.',
  slug: 'This name is already taken. Please choose another.',
  storeSlug: 'This store name is already taken. Please choose another.',
  usernameSlug: 'This username is already taken. Please choose another.',
  userId: 'There was a temporary issue with your session. Please refresh the page and try again.',
  sessionId: 'There was a temporary issue with your session. Please refresh the page and try again.'
};

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error for dev
  console.error(err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'We couldn\'t find what you were looking for.';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    const message = DUPLICATE_FIELD_MESSAGES[field] || 'This information is already in use. Please try something different.';
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Your session is invalid. Please log in again.';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Your session has expired. Please log in again.';
    error = { message, statusCode: 401 };
  }

  // Multer file upload errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      error = { message: 'Image file size must be 5MB or less', statusCode: 400 };
    } else {
      error = { message: 'We couldn\'t upload that file. Please try a different one.', statusCode: 400 };
    }
  }

  const statusCode = error.statusCode || 500;
  // Unhandled errors (no explicit statusCode set anywhere upstream) can carry
  // raw internal details in their message — mask those in production rather
  // than show technical text to the user. Intentional throws always set a
  // non-500 statusCode, so this only catches genuine bugs/unexpected failures.
  const message = statusCode === 500 && process.env.NODE_ENV === 'production'
    ? 'Something went wrong on our end. Please try again in a moment.'
    : (error.message || 'Server Error');

  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
};

module.exports = errorHandler;
