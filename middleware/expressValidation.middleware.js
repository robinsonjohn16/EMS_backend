import { validationResult } from 'express-validator';
import { ApiError } from '../utils/errorClasses.js';

/**
 * Middleware to validate request using express-validator
 * Checks for validation errors and returns them in a standardized format
 */
export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path,
      message: error.msg
    }));
    
    return next(new ApiError('Validation failed', 400, errorMessages));
  }
  
  next();
};

export default validateRequest;