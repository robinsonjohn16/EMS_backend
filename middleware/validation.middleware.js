import { ApiError } from '../utils/errorClasses.js';

// Validate organization creation request
export const validateOrganizationCreate = (req, res, next) => {
  try {
    const { 
      name, 
      email, 
      website, 
      phone, 
      type,
      employeeCount,
      foundedYear,
      revenue
    } = req.body;
    
    // Required fields
    if (!name) {
      throw new ApiError('Organization name is required', 400);
    }
    
    if (name.length < 2 || name.length > 100) {
      throw new ApiError('Organization name must be between 2 and 100 characters', 400);
    }
    
    if (!type) {
      throw new ApiError('Organization type is required', 400);
    }
    
    // Email validation (if provided)
    if (email) {
      validateEmail(email);
    }
    
    // Website validation (if provided)
    if (website) {
      validateWebsite(website);
    }
    
    // Phone validation (if provided)
    if (phone) {
      validatePhone(phone);
    }
    
    // Number validations
    if (employeeCount !== undefined && (isNaN(employeeCount) || employeeCount < 0)) {
      throw new ApiError('Employee count must be a positive number', 400);
    }
    
    if (foundedYear !== undefined) {
      const currentYear = new Date().getFullYear();
      if (isNaN(foundedYear) || foundedYear < 1800 || foundedYear > currentYear) {
        throw new ApiError(`Founded year must be between 1800 and ${currentYear}`, 400);
      }
    }
    
    if (revenue !== undefined && (isNaN(revenue) || revenue < 0)) {
      throw new ApiError('Revenue must be a positive number', 400);
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

// Validate organization update request
export const validateOrganizationUpdate = (req, res, next) => {
  try {
    const { 
      name,
      email, 
      website, 
      phone,
      employeeCount,
      foundedYear,
      revenue
    } = req.body;
    
    // Name validation (if provided)
    if (name && (name.length < 2 || name.length > 100)) {
      throw new ApiError('Organization name must be between 2 and 100 characters', 400);
    }
    
    // Email validation (if provided)
    if (email) {
      validateEmail(email);
    }
    
    // Website validation (if provided)
    if (website) {
      validateWebsite(website);
    }
    
    // Phone validation (if provided)
    if (phone) {
      validatePhone(phone);
    }
    
    // Number validations
    if (employeeCount !== undefined && (isNaN(employeeCount) || employeeCount < 0)) {
      throw new ApiError('Employee count must be a positive number', 400);
    }
    
    if (foundedYear !== undefined) {
      const currentYear = new Date().getFullYear();
      if (isNaN(foundedYear) || foundedYear < 1800 || foundedYear > currentYear) {
        throw new ApiError(`Founded year must be between 1800 and ${currentYear}`, 400);
      }
    }
    
    if (revenue !== undefined && (isNaN(revenue) || revenue < 0)) {
      throw new ApiError('Revenue must be a positive number', 400);
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

// Helper functions
const validateEmail = (email) => {
  const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
  if (!emailRegex.test(email)) {
    throw new ApiError('Please provide a valid email address', 400);
  }
};

const validateWebsite = (website) => {
  const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
  if (!urlRegex.test(website)) {
    throw new ApiError('Please provide a valid website URL', 400);
  }
};

const validatePhone = (phone) => {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  if (!phoneRegex.test(phone)) {
    throw new ApiError('Please provide a valid phone number', 400);
  }
};