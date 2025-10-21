import jwt from 'jsonwebtoken';
import Admin from '../models/auth.model.js';
import { 
  AuthenticationError, 
  InvalidTokenError, 
  TokenExpiredError 
} from '../utils/errorClasses.js';

// Protect routes (for super admin)
export const protect = async (req, res, next) => {
  try {
    let token;

    // First try to get token from cookies (for admin authentication)
    if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }
    // Fallback to Authorization header (for API clients)
    else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    console.log('Admin auth token:', token ? 'Found' : 'Not found');

    // Make sure token exists
    if (!token) {
      throw new AuthenticationError('Authentication token is missing', 'ERR_TOKEN_MISSING');
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.admin = await Admin.findById(decoded.id);
    
    if (!req.admin) {
      throw new AuthenticationError('User account no longer exists', 'ERR_USER_NOT_FOUND');
    }

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new InvalidTokenError('Invalid or malformed token'));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new TokenExpiredError('Authentication token has expired'));
    }
    next(error);
  }
};

// Alias for compatibility with tenant routes
export const authenticateUser = protect;