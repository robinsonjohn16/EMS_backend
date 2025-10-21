import Admin from '../models/auth.model.js';
import jwt from 'jsonwebtoken';
import { successResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/errorClasses.js';

// @desc    Register super admin
// @route   POST /api/auth/register
// @access  Public (should be restricted in production)
export const register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    // Check if admin already exists
    const adminExists = await Admin.findOne({ email });
    if (adminExists) {
      throw new ApiError('Admin with this email already exists', 409);
    }

    // Create admin
    const admin = await Admin.create({
      username,
      email,
      password
    });

    // Generate tokens
    const accessToken = admin.getSignedJwtToken();
    const refreshToken = admin.getRefreshToken();
    
    // Save refresh token to database
    await admin.save();

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    // Set access token as httpOnly cookie
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 1000 // 1 hour
    });

    // Send response
    return successResponse(res, 201, 'Admin registered successfully', { 
      accessToken,
      user: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Login super admin
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate email & password
    if (!email || !password) {
      throw new ApiError('Please provide an email and password', 400);
    }

    // Check for admin
    const admin = await Admin.findOne({ email }).select('+password');
    if (!admin) {
      throw new ApiError('Invalid credentials', 401);
    }

    // Check if password matches
    const isMatch = await admin.matchPassword(password);
    if (!isMatch) {
      throw new ApiError('Invalid credentials', 401);
    }

    // Generate tokens
    const accessToken = admin.getSignedJwtToken();
    const refreshToken = admin.getRefreshToken();
    
    // Save refresh token to database
    await admin.save();

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Send response
    return successResponse(res, 200, 'Login successful', { 
      accessToken,
      user: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current logged in admin
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.admin.id);
    
    return successResponse(res, 200, 'Admin profile retrieved', admin);
  } catch (error) {
    next(error);
  }
};

// @desc    Refresh access token
// @route   POST /api/auth/refresh
// @access  Public (requires refresh token)
export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      throw new ApiError('Refresh token not provided', 401);
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    } catch (error) {
      throw new ApiError('Invalid refresh token', 401);
    }

    // Find admin and check if refresh token matches
    const admin = await Admin.findById(decoded.id).select('+refreshToken +refreshTokenExpire');
    if (!admin || !admin.verifyRefreshToken(refreshToken)) {
      throw new ApiError('Invalid refresh token', 401);
    }

    // Generate new access token
    const accessToken = admin.getSignedJwtToken();

    // Send response
    return successResponse(res, 200, 'Token refreshed successfully', { 
      accessToken,
      user: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Logout admin
// @route   POST /api/auth/logout
// @access  Private
export const logout = async (req, res, next) => {
  try {
    // Clear refresh token from database
    await Admin.findByIdAndUpdate(req.admin.id, {
      $unset: { refreshToken: 1, refreshTokenExpire: 1 }
    });

    // Clear refresh token cookie
    res.clearCookie('refreshToken');

    return successResponse(res, 200, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};