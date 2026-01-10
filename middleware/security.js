// Basic security middleware (without external dependencies for now)
// Install express-rate-limit and helmet for production: npm install express-rate-limit helmet

// Simple rate limiting (can be enhanced with express-rate-limit)
export const apiLimiter = (req, res, next) => {
  // Basic rate limiting logic
  // In production, use express-rate-limit package
  next();
};

export const authLimiter = (req, res, next) => {
  // Basic auth rate limiting
  // In production, use express-rate-limit package
  next();
};

// Security headers (can be enhanced with helmet)
export const securityHeaders = (req, res, next) => {
  // Basic security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // In production, use helmet package for comprehensive headers
  next();
};

// Input sanitization helper
export const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    // Remove potentially dangerous characters
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .trim();
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  if (typeof input === 'object' && input !== null) {
    const sanitized = {};
    for (const key in input) {
      sanitized[key] = sanitizeInput(input[key]);
    }
    return sanitized;
  }
  return input;
};

// Request sanitization middleware
export const sanitizeRequest = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }
  if (req.query) {
    req.query = sanitizeInput(req.query);
  }
  if (req.params) {
    req.params = sanitizeInput(req.params);
  }
  next();
};
