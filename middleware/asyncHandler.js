/**
 * Async handler middleware to avoid try/catch blocks in route handlers
 * @param {Function} fn - The async route handler function
 * @returns {Function} - Express middleware function
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Error handler middleware for consistent error responses
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const errorHandler = (err, req, res, next) => {
  console.error('Error caught by errorHandler:', {
    message: err.message,
    stack: err.stack,
    status: err.status || 500,
    name: err.name,
    code: err.code
  });

  // Set status code
  const statusCode = err.status || 500;
  
  // Prepare error response
  const errorResponse = {
    error: err.name || 'Error',
    message: err.message || 'An unexpected error occurred',
    status: statusCode
  };
  
  // Add details in development mode
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
    errorResponse.details = err.details || err.data;
  }
  
  // Send error response
  res.status(statusCode).json(errorResponse);
};

export default { asyncHandler, errorHandler };
