import TenantUser from '../../models/tenant/auth.model.js';
import Organization from '../../models/organization.model.js';
import Admin from '../../models/auth.model.js';
import { successResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/errorClasses.js';

// Create tenant user by super admin
export const createTenantUser = async (req, res, next) => {
  try {
    const { 
      username, 
      email, 
      password, 
      organizationId, 
      role = 'employee',
      firstName,
      lastName,
      phone,
      department,
      position,
      isActive = true 
    } = req.body;
    
    const createdBy = req.admin._id; // Super admin ID from auth middleware

    // Validate required fields
    if (!username || !email || !password || !organizationId) {
      throw new ApiError('Username, email, password, and organization ID are required', 400);
    }

    // Validate role
    const validRoles = ['manager', 'hr', 'employee'];
    if (!validRoles.includes(role)) {
      throw new ApiError(`Invalid role. Must be one of: ${validRoles.join(', ')}`, 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ApiError('Invalid email format', 400);
    }

    // Validate password strength
    if (password.length < 8) {
      throw new ApiError('Password must be at least 8 characters long', 400);
    }

    // Find organization
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError('Organization not found', 404);
    }

    // Check if organization is active
    if (!organization.active) {
      throw new ApiError('Cannot create user for inactive organization', 400);
    }

    // Check if user already exists in this organization by email
    const existingUserByEmail = await TenantUser.findByOrganizationAndEmail(organization._id, email);
    if (existingUserByEmail) {
      throw new ApiError('User with this email already exists in this organization', 409);
    }

    // Check if user already exists in this organization by username
    const existingUserByUsername = await TenantUser.findByOrganizationAndUsername(organization._id, username);
    if (existingUserByUsername) {
      throw new ApiError('User with this username already exists in this organization', 409);
    }

    // Validate phone number if provided
    if (phone && phone.trim()) {
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
      if (!phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''))) {
        throw new ApiError('Invalid phone number format', 400);
      }
    }

    // Create tenant user
    const tenantUser = new TenantUser({
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password,
      firstName: firstName?.trim(),
      lastName: lastName?.trim(),
      phone: phone?.trim(),
      organization: organization._id,
      role,
      department: department?.trim(),
      position: position?.trim(),
      isActive,
      createdBy
    });

    await tenantUser.save();

    // Populate organization details for response
    await tenantUser.populate([
      { path: 'organization', select: 'name slug active' },
      { path: 'createdBy', select: 'username email' }
    ]);

    // Remove password from response
    const userResponse = tenantUser.toObject();
    delete userResponse.password;

    return successResponse(res, 201, 'Tenant user created successfully', userResponse);
  } catch (error) {
    next(error);
  }
};

// Get all tenant users across organizations (super admin only)
export const getAllTenantUsers = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      organizationId, 
      role, 
      isActive, 
      search 
    } = req.query;

    const query = {};
    
    // Filter by organization if specified
    if (organizationId) {
      query.organization = organizationId;
    }
    
    // Filter by role if specified
    if (role) {
      query.role = role;
    }
    
    // Filter by active status if specified
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    
    const users = await TenantUser.find(query)
      .populate('organization', 'name slug')
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await TenantUser.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    const pagination = {
      currentPage: parseInt(page),
      totalPages,
      totalUsers: total,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };

    return successResponse(res, 200, 'Tenant users retrieved successfully', {
      users,
      pagination
    });
  } catch (error) {
    next(error);
  }
};

// Get tenant user by ID (super admin only)
export const getTenantUserById = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await TenantUser.findById(userId)
      .populate('organization', 'name slug email')
      .populate('createdBy', 'username email');

    if (!user) {
      throw new ApiError('Tenant user not found', 404);
    }

    return successResponse(res, 200, 'Tenant user retrieved successfully', user);
  } catch (error) {
    next(error);
  }
};

// Update tenant user (super admin only)
export const updateTenantUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { 
      username,
      email,
      firstName,
      lastName,
      phone,
      role,
      department,
      position,
      isActive 
    } = req.body;

    const user = await TenantUser.findById(userId);
    if (!user) {
      throw new ApiError('Tenant user not found', 404);
    }

    // Validate role if provided
    if (role) {
      const validRoles = ['manager', 'hr', 'employee'];
      if (!validRoles.includes(role)) {
        throw new ApiError(`Invalid role. Must be one of: ${validRoles.join(', ')}`, 400);
      }
    }

    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new ApiError('Invalid email format', 400);
      }
    }

    // Validate phone number if provided
    if (phone && phone.trim()) {
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
      if (!phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''))) {
        throw new ApiError('Invalid phone number format', 400);
      }
    }

    // Check if email is being changed and already exists in the same organization
    if (email && email.toLowerCase().trim() !== user.email) {
      const existingUser = await TenantUser.findByOrganizationAndEmail(user.organization, email.toLowerCase().trim());
      if (existingUser) {
        throw new ApiError('Email already exists in this organization', 409);
      }
    }

    // Check if username is being changed and already exists in the same organization
    if (username && username.trim() !== user.username) {
      const existingUser = await TenantUser.findByOrganizationAndUsername(user.organization, username.trim());
      if (existingUser) {
        throw new ApiError('Username already exists in this organization', 409);
      }
    }

    // Update fields with proper trimming and formatting
    const updateFields = {};
    if (username) updateFields.username = username.trim();
    if (email) updateFields.email = email.toLowerCase().trim();
    if (firstName !== undefined) updateFields.firstName = firstName?.trim();
    if (lastName !== undefined) updateFields.lastName = lastName?.trim();
    if (phone !== undefined) updateFields.phone = phone?.trim();
    if (role) updateFields.role = role;
    if (department !== undefined) updateFields.department = department?.trim();
    if (position !== undefined) updateFields.position = position?.trim();
    if (isActive !== undefined) updateFields.isActive = isActive;

    const updatedUser = await TenantUser.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true, runValidators: true }
    ).populate([
      { path: 'organization', select: 'name slug active' },
      { path: 'createdBy', select: 'username email' }
    ]);

    // Remove password from response
    const userResponse = updatedUser.toObject();
    delete userResponse.password;

    return successResponse(res, 200, 'Tenant user updated successfully', userResponse);
  } catch (error) {
    next(error);
  }
};

// Delete tenant user (super admin only)
export const deleteTenantUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await TenantUser.findById(userId);
    if (!user) {
      throw new ApiError('Tenant user not found', 404);
    }

    await TenantUser.findByIdAndDelete(userId);

    return successResponse(res, 200, 'Tenant user deleted successfully', null);
  } catch (error) {
    next(error);
  }
};

// Toggle tenant user status (super admin only)
export const toggleTenantUserStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await TenantUser.findById(userId);
    if (!user) {
      throw new ApiError('Tenant user not found', 404);
    }

    user.isActive = !user.isActive;
    await user.save();

    await user.populate('organization', 'name slug');

    return successResponse(res, 200, `Tenant user ${user.isActive ? 'activated' : 'deactivated'} successfully`, user);
  } catch (error) {
    next(error);
  }
};

// Get tenant users by organization (super admin only)
export const getTenantUsersByOrganization = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const { page = 1, limit = 10, role, status, search } = req.query;

    // Verify organization exists
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError('Organization not found', 404);
    }

    const query = { organization: organizationId };
    
    // Filter by role if specified and not undefined
    if (role && role !== 'undefined' && role !== 'all') {
      query.role = role;
    }
    
    // Filter by active status if specified and not undefined
    if (status && status !== 'undefined' && status !== 'all') {
      query.isActive = status === 'true';
    }
    
    // Search functionality
    if (search && search !== '') {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    
    const users = await TenantUser.find(query)
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    console.log(users);
    const total = await TenantUser.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    const pagination = {
      currentPage: parseInt(page),
      totalPages,
      totalUsers: total,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };

    return successResponse(res, 200, 'Organization tenant users retrieved successfully', {
      organization: {
        _id: organization._id,
        name: organization.name,
        slug: organization.slug
      },
      users,
      pagination
    });
  } catch (error) {
    next(error);
  }
};