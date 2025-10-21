import jwt from 'jsonwebtoken';
import TenantUser from '../models/tenant/auth.model.js';
import { ApiError } from '../utils/errorClasses.js';

// Middleware to authenticate tenant users
const authenticateTenant = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');    
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      return next(new ApiError('Access token is required', 401));
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if it's a tenant user
    if (decoded.type !== 'tenant') {
      return next(new ApiError('Invalid token type', 401));
    }

    // Find user
    const user = await TenantUser.findById(decoded._id)
      .populate('organization', 'name slug active');

    if (!user) {
      return next(new ApiError('User not found', 401));
    }

    // Check if user is active
    if (!user.isActive) {
      return next(new ApiError('Account is deactivated', 401));
    }

    // Check if organization is active
    if (!user.organization.active) {
      return next(new ApiError('Organization is not active', 401));
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new ApiError('Invalid token', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new ApiError('Token expired', 401));
    }
    next(error);
  }
};

// Middleware to check tenant user roles
const requireRole = (...roles) => {
  return (req, res, next) => {
    console.log(req.user)
    console.log(roles)
    if (!req.user) {
      return next(new ApiError('Authentication required', 401));
    }
    console.log(roles[1])

    if (!roles.includes(req.user.role)) {
      return next(new ApiError(`Access denied. Required role: ${roles.join(' or ')}`, 403));
    }

    next();
  };
};

// Middleware to check if user is manager
const requireManager = (req, res, next) => {
  if (!req.user) {
    return next(new ApiError('Authentication required', 401));
  }
  
  if (req.user.role !== 'manager') {
    return next(new ApiError('Access denied. Manager role required', 403));
  }
  
  next();
};

// Middleware to check if user is HR or Manager
const requireHROrManager = (req, res, next) => {
  if (!req.user) {
    return next(new ApiError('Authentication required', 401));
  }
  
  const allowedRoles = ['manager', 'hr'];
  if (!allowedRoles.includes(req.user.role)) {
    return next(new ApiError('Access denied. HR or Manager role required', 403));
  }
  
  next();
};

export {
  authenticateTenant,
  authenticateTenant as verifyTenantToken, // Alias for backward compatibility
  requireRole,
  requireManager,
  requireHROrManager
};