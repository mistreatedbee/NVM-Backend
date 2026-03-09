/**
 * Input validation utilities
 */

export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePhone = (phone) => {
  // South African phone number validation
  const phoneRegex = /^(\+27|0)[1-9][0-9]{8}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

export const validateIDNumber = (idNumber) => {
  // South African ID number validation (13 digits)
  const idRegex = /^[0-9]{13}$/;
  return idRegex.test(idNumber.replace(/\s/g, ''));
};

export const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers
};

export const validateSubmissionData = (data) => {
  const errors = [];

  if (data.email && !validateEmail(data.email)) {
    errors.push('Invalid email format');
  }

  if (data.phone && !validatePhone(data.phone)) {
    errors.push('Invalid phone number format');
  }

  if (data.id_number && !validateIDNumber(data.id_number)) {
    errors.push('Invalid ID number format');
  }

  if (data.donation_amount && (isNaN(data.donation_amount) || data.donation_amount < 0)) {
    errors.push('Invalid donation amount');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

