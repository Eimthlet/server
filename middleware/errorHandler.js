import { validationResult } from 'express-validator';

/**
 * Standardized error response format
 * @param {Error} error - The error object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @returns {Object} Standardized error response object
 */
function formatErrorResponse(error, statusCode = 500, message = null) {
  console.error('Error details:', {
    name: error?.name,
    message: error?.message,
    stack: process.env.NODE_ENV !== 'production' ? error?.stack : undefined,
    code: error?.code,
    statusCode
  });

  return {
    success: false,
    error: message || error?.message || 'An unexpected error occurred',
    status: statusCode,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV !== 'production' && { details: error?.stack })
  };
}

/**
 * Validation middleware using express-validator
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
}

/**
 * Async handler to catch errors in async route handlers
 * @param {Function} fn - Async route handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      next(error);
    });
  };
}

/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Handle specific error types
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Invalid or expired token';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
  } else if (err.code === '23505') {
    // PostgreSQL unique constraint violation
    statusCode = 409;
    message = 'Duplicate entry';
  } else if (err.code === '22P02') {
    // PostgreSQL invalid input syntax
    statusCode = 400;
    message = 'Invalid input data';
  }

  res.status(statusCode).json(formatErrorResponse(err, statusCode, message));
}

export { errorHandler, asyncHandler, validate, formatErrorResponse };
