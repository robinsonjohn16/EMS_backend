import TenantUser from '../../models/tenant/auth.model.js';
import Organization from '../../models/organization.model.js';
import { successResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/errorClasses.js';
import jwt from 'jsonwebtoken';

// Subdomain specific controller functions
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const organization = req.organization;

    if (!email || !password) {
      throw new ApiError('Email and password are required', 400);
    }

    const user = await TenantUser.findByOrganizationAndEmail(organization._id, email)
      .select('+password');
    if (!user) {
      throw new ApiError('Invalid credentials', 401);
    }

    const isMatch = await user.comparePassword(password);
    // const isMatch = true;
    if (!isMatch) {
      throw new ApiError('Invalid credentials', 401);
    }

    const token = user.generateAccessToken()

    return successResponse(res, 200, 'Login successful', {
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organization: {
          id: organization._id,
          name: organization.name,
          slug: organization.slug
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    const user = await TenantUser.findById(req.user.id)
      .select('-password')
      .populate('organization', 'name slug logo');
    
    if (!user) {
      throw new ApiError('User not found', 404);
    }

    return successResponse(res, 200, 'Profile retrieved successfully', user);
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const { firstName, lastName, avatar, hrFeatureAccess } = req.body;
    const user = await TenantUser.findById(req.user.id);
    
    if (!user) {
      throw new ApiError('User not found', 404);
    }

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (avatar !== undefined) user.avatar = avatar;

    // Allow HR to explicitly select HR-related features
    if (hrFeatureAccess !== undefined) {
      if (user.role !== 'hr') {
        throw new ApiError('Only HR can update HR feature access selections', 403);
      }
      user.hrFeatureAccess = {
        attendanceConfig: !!hrFeatureAccess.attendanceConfig,
        leavePolicy: !!hrFeatureAccess.leavePolicy,
        geofencing: !!hrFeatureAccess.geofencing,
      };
    }

    await user.save();

    return successResponse(res, 200, 'Profile updated successfully', user);
  } catch (error) {
    next(error);
  }
};

// Subdomain-specific changePassword function
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      throw new ApiError('Current password and new password are required', 400);
    }

    const user = await TenantUser.findById(req.user.id).select('+password');
    if (!user) {
      throw new ApiError('User not found', 404);
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      throw new ApiError('Current password is incorrect', 401);
    }

    user.password = newPassword;
    await user.save();

    return successResponse(res,200, 'passsword updated', { message: 'Password updated successfully' });
  } catch (error) {
    next(error);
  }
};

// Register tenant user (only super admin can create)
export const registerTenantUser = async (req, res, next) => {
  try {
    const { username, email, password, organizationSlug, role } = req.body;
    const createdBy = req.user._id; // Super admin ID from auth middleware

    // Validate required fields
    if (!username || !email || !password || !organizationSlug) {
      throw new ApiError('Username, email, password, and organization slug are required', 400);
    }

    // Find organization by slug
    const organization = await Organization.findBySlug(organizationSlug);
    if (!organization) {
      throw new ApiError('Organization not found', 404);
    }

    // Check if user already exists in this organization
    const existingUserByEmail = await TenantUser.findByOrganizationAndEmail(organization._id, email);
    if (existingUserByEmail) {
      throw new ApiError('User with this email already exists in this organization', 409);
    }

    const existingUserByUsername = await TenantUser.findByOrganizationAndUsername(organization._id, username);
    if (existingUserByUsername) {
      throw new ApiError('User with this username already exists in this organization', 409);
    }

    // Create tenant user
    const tenantUser = new TenantUser({
      username,
      email,
      password,
      organization: organization._id,
      role: role || 'employee',
      createdBy
    });

    try {
      await tenantUser.save();
    } catch (dbError) {
      console.error('Database error during tenant user creation:', dbError);
      throw new ApiError('Failed to create tenant user due to database error', 500);
    }

    // Generate tokens
    const accessToken = tenantUser.generateAccessToken();
    const refreshToken = tenantUser.generateRefreshToken();

    // Save refresh token
    tenantUser.refreshToken = refreshToken;
    try {
      await tenantUser.save();
    } catch (dbError) {
      console.error('Database error during token save:', dbError);
      throw new ApiError('Failed to save authentication tokens', 500);
    }

    // Remove sensitive data
    const userResponse = tenantUser.toJSON();

    return successResponse(res, 201, 'Tenant user created successfully', {
      user: userResponse,
      accessToken,
      refreshToken,
      organization: {
        _id: organization._id,
        name: organization.name,
        slug: organization.slug
      }
    });
  } catch (error) {
    next(error);
  }
};

// Login tenant user
export const loginTenantUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    // Validate required fields
    if (!email || !password) {
      throw new ApiError('Email, password, and organization slug are required', 400);
    }

    // Find organization by slug
    const organization = await Organization.findBySlug(req.organization.slug);
    if (!organization) {
      throw new ApiError('Organization not found', 404);
    }

    // Find user by organization and email
    const user = await TenantUser.findByOrganizationAndEmail(organization._id, email)
      .select('+password')
      .populate('organization', 'name slug');

    if (!user) {
      throw new ApiError('Invalid email or password', 401);
    }

    // Check if user is active
    if (!user.isActive) {
      throw new ApiError('Account is deactivated. Please contact your administrator.', 403);
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw new ApiError('Invalid email or password', 401);
    }

    // Generate tokens
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // Save refresh token and update last login
    user.refreshToken = refreshToken;
    try {
      await user.updateLastLogin();
    } catch (dbError) {
      console.error('Database error during last login update:', dbError);
      throw new ApiError('Failed to update last login', 500);
    }

    return successResponse(res, 200, 'Login successful', {
      user,
      accessToken,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
};

// Refresh token
export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      throw new ApiError('Refresh token is required', 401);
    }

    // Verify refresh token
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    
    // Find user
    const user = await TenantUser.findById(decoded._id)
      .select('+refreshToken')
      .populate('organization', 'name slug');

    if (!user || user.refreshToken !== token) {
      throw new ApiError('Invalid refresh token', 401);
    }

    // Check if user is active
    if (!user.isActive) {
      throw new ApiError('Account is deactivated', 403);
    }

    // Generate new tokens
    const newAccessToken = user.generateAccessToken();
    const newRefreshToken = user.generateRefreshToken();

    // Update refresh token
    user.refreshToken = newRefreshToken;
    try {
      await user.save();
    } catch (dbError) {
      console.error('Database error during token refresh:', dbError);
      throw new ApiError('Failed to save new refresh token', 500);
    }

    // Remove sensitive data
    const userResponse = user.toJSON();

    return successResponse(res, 200, 'Token refreshed successfully', {
      user: userResponse,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      organization: {
        _id: user.organization._id,
        name: user.organization.name,
        slug: user.organization.slug
      }
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new ApiError('Invalid refresh token', 401));
    }
    next(error);
  }
};

// Logout tenant user
export const logoutTenantUser = async (req, res, next) => {
  try {
    const user = await TenantUser.findById(req.user._id);
    
    if (user) {
      user.refreshToken = null;
      try {
        await user.save();
      } catch (dbError) {
        console.error('Database error during logout:', dbError);
        throw new ApiError('Failed to logout user', 500);
      }
    }

    return successResponse(res, 200, 'Logout successful', null);
  } catch (error) {
    next(error);
  }
};

// Get tenant user profile
export const getTenantUserProfile = async (req, res, next) => {
  try {
    const user = await TenantUser.findById(req.user._id)
      .populate('organization', 'name slug')
      .populate('createdBy', 'username email');

    if (!user) {
      throw new ApiError('User not found', 404);
    }

    return successResponse(res, 200, 'Profile retrieved successfully', user);
  } catch (error) {
    next(error);
  }
};

// Update tenant user profile
export const updateTenantUserProfile = async (req, res, next) => {
  try {
    const { username, email, hrFeatureAccess } = req.body;
    const userId = req.user._id;

    // Check if email is being changed and if it already exists
    if (email) {
      const existingUser = await TenantUser.findOne({
        email,
        organization: req.user.organization,
        _id: { $ne: userId }
      });

      if (existingUser) {
        throw new ApiError('Email already exists in this organization', 409);
      }
    }

    // Check if username is being changed and if it already exists
    if (username) {
      const existingUser = await TenantUser.findOne({
        username,
        organization: req.user.organization,
        _id: { $ne: userId }
      });

      if (existingUser) {
        throw new ApiError('Username already exists in this organization', 409);
      }
    }

    const update = { username, email };

    // Allow HR to explicitly select feature access via this route
    if (hrFeatureAccess !== undefined) {
      const current = await TenantUser.findById(userId);
      if (!current) throw new ApiError('User not found', 404);
      if (current.role !== 'hr') {
        throw new ApiError('Only HR can update HR feature access selections', 403);
      }
      update.hrFeatureAccess = {
        attendanceConfig: !!hrFeatureAccess.attendanceConfig,
        leavePolicy: !!hrFeatureAccess.leavePolicy,
        geofencing: !!hrFeatureAccess.geofencing,
      };
    }

    const updatedUser = await TenantUser.findByIdAndUpdate(
      userId,
      update,
      { new: true, runValidators: true }
    ).populate('organization', 'name slug');

    if (!updatedUser) {
      throw new ApiError('User not found', 404);
    }

    return successResponse(res, 200, 'Profile updated successfully', updatedUser);
  } catch (error) {
    next(error);
  }
};