import { ApiError } from '../utils/errorClasses.js';
import { errorResponse } from '../utils/apiResponse.js';

/**
 * Global error handler middleware
 * Catches all errors and formats them consistently
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error for debugging
  console.error('Error:', err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = new ApiError(404, message);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = new ApiError(400, message);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = new ApiError(400, message);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new ApiError(401, message);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new ApiError(401, message);
  }

  // Custom API errors
  if (err instanceof ApiError) {
    return errorResponse(res, err.statusCode, err.message, err.errors);
  }

  // Default server error
  return errorResponse(res, 500, 'Server Error', null);
};

/**
 * Not found handler middleware
 * Handles 404 errors for undefined routes
 */
export const notFoundHandler = (req, res, next) => {
  errorResponse(res, 404, `Route not found: ${req.originalUrl}`);
};

export { errorHandler };