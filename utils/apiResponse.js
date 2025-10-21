/**
 * Standard API Response Handler
 * Provides consistent response format across the application
 */

/**
 * Send success response
 * @param {object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Success message
 * @param {object|array} data - Response data
 * @param {object} meta - Additional metadata (pagination, etc.)
 */
export const successResponse = (
  res,
  statusCode = 200,
  message = 'Success',
  data = null,
  meta = {}
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    meta,
    timestamp: new Date().toISOString()
  });
};

/**
 * Send error response
 * @param {object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {object} errors - Detailed error information
 */
export const errorResponse = (
  res,
  statusCode = 500,
  message = 'Server Error',
  errors = null
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
    timestamp: new Date().toISOString()
  });
};

/**
 * Send validation error response
 * @param {object} res - Express response object
 * @param {object} errors - Validation errors
 */
export const validationErrorResponse = (res, errors) => {
  return errorResponse(
    res,
    400,
    'Validation Error',
    errors
  );
};

/**
 * Send not found response
 * @param {object} res - Express response object
 * @param {string} message - Not found message
 */
export const notFoundResponse = (res, message = 'Resource not found') => {
  return errorResponse(
    res,
    404,
    message
  );
};

/**
 * Send unauthorized response
 * @param {object} res - Express response object
 * @param {string} message - Unauthorized message
 */
export const unauthorizedResponse = (res, message = 'Unauthorized access') => {
  return errorResponse(
    res,
    401,
    message
  );
};

/**
 * Send forbidden response
 * @param {object} res - Express response object
 * @param {string} message - Forbidden message
 */
export const forbiddenResponse = (res, message = 'Forbidden access') => {
  return errorResponse(
    res,
    403,
    message
  );
};