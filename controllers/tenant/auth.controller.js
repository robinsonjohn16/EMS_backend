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
    const { 
      firstName, 
      lastName, 
      avatar, 
      hrFeatureAccess,
      panNumber,
      aadhaarNumber,
      bankAccountNumber,
      ifscCode,
      gender
    } = req.body
    const user = await TenantUser.findById(req.user.id)
    if (!user) {
      throw new ApiError('User not found', 404)
    }

    const updateSet = {}

    // Normalize avatar path to web URL under /uploads
    if (req.file) {
      const orgId = req.organization?._id?.toString() || req.user?.organization?.toString() || 'unknown_org'
      const avatarUrlPath = `/uploads/avatars/${orgId}/${req.file.filename}`
      updateSet.avatar = avatarUrlPath
    }

    if (firstName !== undefined) updateSet.firstName = firstName
    if (lastName !== undefined) updateSet.lastName = lastName
    if (avatar !== undefined) updateSet.avatar = avatar
    if (panNumber !== undefined) updateSet.panNumber = panNumber
    if (aadhaarNumber !== undefined) updateSet.aadhaarNumber = aadhaarNumber
    if (bankAccountNumber !== undefined) updateSet.bankAccountNumber = bankAccountNumber
    if (ifscCode !== undefined) updateSet.ifscCode = ifscCode
    if (gender !== undefined) updateSet.gender = gender

    if (hrFeatureAccess !== undefined) {
      if (user.role !== 'hr') {
        throw new ApiError('Only HR can update HR feature access selections', 403)
      }
      updateSet.hrFeatureAccess = {
        attendanceConfig: !!hrFeatureAccess.attendanceConfig,
        leavePolicy: !!hrFeatureAccess.leavePolicy,
        geofencing: !!hrFeatureAccess.geofencing,
      }
    }

    if (Object.keys(updateSet).length === 0) {
      return successResponse(res, 200, 'Profile updated successfully', user)
    }

    const updatedUser = await TenantUser.findByIdAndUpdate(
      req.user.id,
      { $set: updateSet },
      { new: true, runValidators: true, context: 'query' }
    )

    const userResponse = updatedUser.toObject()
    delete userResponse.password

    return successResponse(res, 200, 'Profile updated successfully', {
      success: true,
      user: userResponse
    })
  } catch (error) {
    next(error)
  }
}

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
    const {
      username,
      email,
      hrFeatureAccess,
      avatar,
      employeeId,
      dateOfJoining,
      gender,
      panNumber,
      aadhaarNumber,
      uanNumber,
      esicIpNumber,
      bankAccountNumber,
      ifscCode,
      firstName,
      lastName
    } = req.body

    const userId = req.user._id

    if (email) {
      const existingUser = await TenantUser.findOne({
        email,
        organization: req.user.organization,
        _id: { $ne: userId }
      })
      if (existingUser) {
        throw new ApiError('Email already exists in this organization', 409)
      }
    }

    if (username) {
      const existingUser = await TenantUser.findOne({
        username,
        organization: req.user.organization,
        _id: { $ne: userId }
      })
      if (existingUser) {
        throw new ApiError('Username already exists in this organization', 409)
      }
    }

    const user = await TenantUser.findById(userId)
    if (!user) {
      throw new ApiError('User not found', 404)
    }

    if (username !== undefined) user.username = username
    if (email !== undefined) user.email = email
    if (firstName !== undefined) user.firstName = firstName
    if (lastName !== undefined) user.lastName = lastName

    // Normalize avatar path to web URL under /uploads
    if (req.file) {
      const orgId = req.organization?._id?.toString() || req.user?.organization?.toString() || 'unknown_org'
      const avatarUrlPath = `/uploads/avatars/${orgId}/${req.file.filename}`
      user.avatar = avatarUrlPath
    } else if (avatar !== undefined) {
      user.avatar = avatar
    }

    if (employeeId !== undefined) user.employeeId = employeeId
    if (dateOfJoining !== undefined) user.dateOfJoining = dateOfJoining ? new Date(dateOfJoining) : undefined
    if (gender !== undefined) user.gender = gender
    if (panNumber !== undefined) user.panNumber = typeof panNumber === 'string' ? panNumber.toUpperCase().trim() : panNumber
    if (aadhaarNumber !== undefined) user.aadhaarNumber = aadhaarNumber
    if (uanNumber !== undefined) user.uanNumber = uanNumber
    if (esicIpNumber !== undefined) user.esicIpNumber = esicIpNumber
    if (bankAccountNumber !== undefined) user.bankAccountNumber = bankAccountNumber
    if (ifscCode !== undefined) user.ifscCode = typeof ifscCode === 'string' ? ifscCode.toUpperCase().trim() : ifscCode

    if (hrFeatureAccess !== undefined) {
      if (user.role !== 'hr') {
        throw new ApiError('Only HR can update HR feature access selections', 403)
      }
      user.hrFeatureAccess = {
        attendanceConfig: !!hrFeatureAccess.attendanceConfig,
        leavePolicy: !!hrFeatureAccess.leavePolicy,
        geofencing: !!hrFeatureAccess.geofencing,
      }
    }

    await user.save()
    await user.populate('organization', 'name slug')

    const userResponse = user.toObject()
    delete userResponse.password

    return successResponse(res, 200, 'Profile updated successfully', userResponse)
  } catch (error) {
    next(error)
  }
}