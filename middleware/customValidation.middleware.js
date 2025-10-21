import validator from 'validator';

// Custom validation middleware using validator library
export const validateRequest = (validationRules) => {
  return (req, res, next) => {
    const errors = [];
    
    // Validate each field based on the rules
    for (const field in validationRules) {
      const rules = validationRules[field];
      const value = getNestedValue(req.body, field) || getNestedValue(req.params, field) || getNestedValue(req.query, field);
      
      // Check if field is required
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field,
          message: rules.requiredMessage || `${field} is required`
        });
        continue;
      }
      
      // Skip validation if field is not required and empty
      if (!rules.required && (value === undefined || value === null || value === '')) {
        continue;
      }
      
      // Convert value to string for validation
      const stringValue = String(value);
      
      // Apply validation rules
      for (const rule of rules.validations || []) {
        let isValid = true;
        let errorMessage = rule.message || `Invalid ${field}`;
        
        switch (rule.type) {
          case 'email':
            isValid = validator.isEmail(stringValue);
            break;
          case 'length':
            if (rule.min !== undefined && rule.max !== undefined) {
              isValid = validator.isLength(stringValue, { min: rule.min, max: rule.max });
            } else if (rule.min !== undefined) {
              isValid = validator.isLength(stringValue, { min: rule.min });
            } else if (rule.max !== undefined) {
              isValid = validator.isLength(stringValue, { max: rule.max });
            }
            break;
          case 'numeric':
            isValid = validator.isNumeric(stringValue);
            break;
          case 'int':
            isValid = validator.isInt(stringValue, rule.options || {});
            break;
          case 'float':
            isValid = validator.isFloat(stringValue, rule.options || {});
            break;
          case 'date':
            isValid = validator.isISO8601(stringValue);
            break;
          case 'boolean':
            isValid = validator.isBoolean(stringValue);
            break;
          case 'mongoId':
            isValid = validator.isMongoId(stringValue);
            break;
          case 'url':
            isValid = validator.isURL(stringValue, rule.options || {});
            break;
          case 'alpha':
            isValid = validator.isAlpha(stringValue);
            break;
          case 'alphanumeric':
            isValid = validator.isAlphanumeric(stringValue);
            break;
          case 'in':
            isValid = validator.isIn(stringValue, rule.values || []);
            break;
          case 'matches':
            isValid = validator.matches(stringValue, rule.pattern);
            break;
          case 'custom':
            if (typeof rule.validator === 'function') {
              isValid = rule.validator(value, req);
            }
            break;
          default:
            console.warn(`Unknown validation type: ${rule.type}`);
        }
        
        if (!isValid) {
          errors.push({
            field,
            message: errorMessage
          });
          break; // Stop at first validation error for this field
        }
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }
    
    next();
  };
};

// Helper function to get nested values from objects
const getNestedValue = (obj, path) => {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
};

// Common validation rules
export const validationRules = {
  // Employee validation
  employeeId: {
    required: true,
    validations: [
      { type: 'mongoId', message: 'Invalid employee ID format' }
    ]
  },
  
  // Date validation
  date: {
    required: true,
    validations: [
      { type: 'date', message: 'Invalid date format. Use ISO 8601 format' }
    ]
  },
  
  startDate: {
    required: true,
    validations: [
      { type: 'date', message: 'Invalid start date format' }
    ]
  },
  
  endDate: {
    required: true,
    validations: [
      { type: 'date', message: 'Invalid end date format' }
    ]
  },
  
  // Pagination validation
  page: {
    required: false,
    validations: [
      { 
        type: 'int', 
        options: { min: 1 },
        message: 'Page must be a positive integer'
      }
    ]
  },
  
  limit: {
    required: false,
    validations: [
      { 
        type: 'int', 
        options: { min: 1, max: 100 },
        message: 'Limit must be between 1 and 100'
      }
    ]
  },
  
  // Boolean validation
  isHalfDay: {
    required: false,
    validations: [
      { type: 'boolean', message: 'isHalfDay must be a boolean value' }
    ]
  },
  
  isActive: {
    required: false,
    validations: [
      { type: 'boolean', message: 'isActive must be a boolean value' }
    ]
  }
};

// Predefined validation sets for common use cases
export const validationSets = {
  // Employee validation
  employeeCreate: {
    employeeId: validationRules.employeeId,
    firstName: validationRules.firstName,
    lastName: validationRules.lastName,
    email: validationRules.email,
    isActive: validationRules.isActive
  },
  
  // Pagination validation
  pagination: {
    page: validationRules.page,
    limit: validationRules.limit
  },
  
  // Date range validation
  dateRange: {
    startDate: validationRules.startDate,
    endDate: validationRules.endDate
  }
};

export default { validateRequest, validationRules, validationSets };