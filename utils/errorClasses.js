/**
 * Custom Error Classes
 * Provides specialized error types for different scenarios with specific error codes
 */

// Base API Error class
export class ApiError extends Error {
  constructor(message, statusCode, errorCode = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode || `ERR_${statusCode}`;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 400 Bad Request - Validation Error
export class ValidationError extends ApiError {
  constructor(message = 'Validation Error', errors = null) {
    super(message, 400, 'ERR_VALIDATION');
    this.errors = errors;
  }
}

// 400 Bad Request Error
export class BadRequestError extends ApiError {
  constructor(message = 'Bad request', errorCode = 'ERR_BAD_REQUEST') {
    super(message, 400, errorCode);
  }
}

// 401 Authentication Errors
export class AuthenticationError extends ApiError {
  constructor(message = 'Authentication failed', errorCode = 'ERR_AUTH_FAILED') {
    super(message, 401, errorCode);
  }
}

export class TokenExpiredError extends AuthenticationError {
  constructor(message = 'Token has expired') {
    super(message, 'ERR_TOKEN_EXPIRED');
  }
}

export class InvalidTokenError extends AuthenticationError {
  constructor(message = 'Invalid token provided') {
    super(message, 'ERR_INVALID_TOKEN');
  }
}

export class TokenRefreshError extends AuthenticationError {
  constructor(message = 'Failed to refresh token') {
    super(message, 'ERR_TOKEN_REFRESH');
  }
}

// 403 Forbidden Error
export class ForbiddenError extends ApiError {
  constructor(message = 'Access forbidden', errorCode = 'ERR_FORBIDDEN') {
    super(message, 403, errorCode);
  }
}

// 404 Not Found Error
export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found', errorCode = 'ERR_NOT_FOUND') {
    super(message, 404, errorCode);
  }
}

// 409 Conflict Error
export class ConflictError extends ApiError {
  constructor(message = 'Resource conflict', errorCode = 'ERR_CONFLICT') {
    super(message, 409, errorCode);
  }
}

// 500 Server Error
export class ServerError extends ApiError {
  constructor(message = 'Internal server error', errorCode = 'ERR_SERVER') {
    super(message, 500, errorCode);
  }
}
