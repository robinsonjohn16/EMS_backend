import TenantUser from '../../models/tenant/auth.model.js';
import Organization from '../../models/organization.model.js';
import { successResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/errorClasses.js';
import { Parser } from '@json2csv/plainjs';

// Create tenant user
const createTenantUser = async (req, res, next) => {
  try {
    const { 
      firstName, 
      lastName, 
      email, 
      password, 
      phone, 
      role, 
      department, 
      position, 
      isActive = true 
    } = req.body;
    
    const organizationId = req.params.organizationId || req.organization?._id;
    const createdBy = req.user._id;

    // Validate required fields
    if (!firstName || !lastName || !email || !password) {
      throw new ApiError('First name, last name, email, and password are required', 400);
    }

    // Find organization
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError('Organization not found', 404);
    }

    // Check if user already exists in this organization
    const existingUser = await TenantUser.findByOrganizationAndEmail(organization._id, email);
    if (existingUser) {
      throw new ApiError('User with this email already exists in this organization', 409);
    }

    // Create tenant user
    const tenantUser = new TenantUser({
      firstName,
      lastName,
      email,
      password,
      phone,
      organization: organization._id,
      role: role || 'employee',
      department,
      position,
      isActive,
      createdBy
    });

    await tenantUser.save();

    // Remove password from response
    const userResponse = tenantUser.toObject();
    delete userResponse.password;

    return successResponse(res, 201, 'User created successfully', userResponse);
  } catch (error) {
    next(error);
  }
};

// Get all tenant users
const getTenantUsers = async (req, res, next) => {
  try {
    const organizationId = req.organization._id;
    const { 
      page = 1, 
      limit = 10, 
      search, 
      role, 
      status, 
      department,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = { organization: organizationId };
    
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (role) {
      filter.role = role;
    }
    
    if (status) {
      filter.isActive = status === 'active';
    }
    
    if (department) {
      filter.department = department;
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get users with pagination
    const users = await TenantUser.find(filter)
      .select('-password')
      .populate('organization', 'name slug')
      .populate('createdBy', 'firstName lastName email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await TenantUser.countDocuments(filter);

    return successResponse(res, 200, 'Users retrieved successfully', {
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get single tenant user
const getTenantUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const organizationId = req.organization._id;

    const user = await TenantUser.findOne({ 
      _id: userId, 
      organization: organizationId 
    })
      .select('-password')
      .populate('organization', 'name slug')
      .populate('createdBy', 'firstName lastName email');

    if (!user) {
      throw new ApiError('User not found', 404);
    }

    return successResponse(res, 200, 'User retrieved successfully', user);
  } catch (error) {
    next(error);
  }
};

// Update tenant user
const updateTenantUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const organizationId = req.organization._id;
    const { 
      firstName, 
      lastName, 
      email, 
      phone, 
      role, 
      department, 
      position, 
      isActive,
      // Additional employee fields
      employeeId,
      dateOfJoining,
      gender,
      panNumber,
      aadhaarNumber,
      uanNumber,
      esicIpNumber,
      bankAccountNumber,
      ifscCode
    } = req.body;

    const user = await TenantUser.findOne({ 
      _id: userId, 
      organization: organizationId 
    });

    if (!user) {
      throw new ApiError('User not found', 404);
    }

    // Check if email is being changed and already exists
    if (email && email !== user.email) {
      const existingUser = await TenantUser.findByOrganizationAndEmail(organizationId, email);
      if (existingUser) {
        throw new ApiError('Email already exists in this organization', 409);
      }
    }

    // Check if employeeId is being changed and already exists
    if (employeeId && employeeId !== user.employeeId) {
      const existingEmployee = await TenantUser.findOne({
        organization: organizationId,
        employeeId: employeeId,
        _id: { $ne: userId }
      });
      if (existingEmployee) {
        throw new ApiError('Employee ID already exists in this organization', 409);
      }
    }

    // Update basic fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (role) user.role = role;
    if (department !== undefined) user.department = department;
    if (position !== undefined) user.position = position;
    if (isActive !== undefined) user.isActive = isActive;

    // Update additional employee fields
    if (employeeId !== undefined) user.employeeId = employeeId;
    if (dateOfJoining !== undefined) user.dateOfJoining = dateOfJoining;
    if (gender !== undefined) user.gender = gender;
    if (panNumber !== undefined) user.panNumber = panNumber;
    if (aadhaarNumber !== undefined) user.aadhaarNumber = aadhaarNumber;
    if (uanNumber !== undefined) user.uanNumber = uanNumber;
    if (esicIpNumber !== undefined) user.esicIpNumber = esicIpNumber;
    if (bankAccountNumber !== undefined) user.bankAccountNumber = bankAccountNumber;
    if (ifscCode !== undefined) user.ifscCode = ifscCode;

    await user.save();

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    return successResponse(res, 200, 'User updated successfully', userResponse);
  } catch (error) {
    next(error);
  }
};

// Delete tenant user
const deleteTenantUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const organizationId = req.organization._id;

    const user = await TenantUser.findOne({ 
      _id: userId, 
      organization: organizationId 
    });

    if (!user) {
      throw new ApiError('User not found', 404);
    }

    // Check if this is the last manager
    if (user.role === 'manager') {
      const managerCount = await TenantUser.countDocuments({
        organization: user.organization,
        role: 'manager',
        isActive: true,
        _id: { $ne: userId }
      });
      
      if (managerCount <= 1) {
        throw new ApiError('Cannot delete the last active manager', 400);
      }
    }

    await TenantUser.findByIdAndDelete(userId);

    return successResponse(res, 200, 'User deleted successfully', null);
  } catch (error) {
    next(error);
  }
};

// Toggle user status
const toggleTenantUserStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const organizationId = req.organization._id;
    const { isActive } = req.body;

    const user = await TenantUser.findOne({ 
      _id: userId, 
      organization: organizationId 
    });

    if (!user) {
      throw new ApiError('User not found', 404);
    }

    // Check if trying to deactivate the last manager
    if (!isActive && user.role === 'manager') {
      const activeManagerCount = await TenantUser.countDocuments({
        organization: user.organization,
        role: 'manager',
        isActive: true,
        _id: { $ne: userId }
      });
      
      if (activeManagerCount <= 1) {
        throw new ApiError('Cannot deactivate the last active manager', 400);
      }
    }

    user.isActive = isActive;
    await user.save();

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    return successResponse(res, 200, `User ${isActive ? 'activated' : 'deactivated'} successfully`, userResponse);
  } catch (error) {
    next(error);
  }
};

// Bulk update users
const bulkUpdateTenantUsers = async (req, res, next) => {
  try {
    const organizationId = req.organization._id;
    const { operations } = req.body;

    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      throw new ApiError('Operations array is required', 400);
    }

    const results = [];

    for (const operation of operations) {
      const { userId, action, data } = operation;

      try {
        const user = await TenantUser.findOne({ 
          _id: userId, 
          organization: organizationId 
        });

        if (!user) {
          results.push({ userId, success: false, error: 'User not found' });
          continue;
        }

        switch (action) {
          case 'activate':
            user.isActive = true;
            await user.save();
            results.push({ userId, success: true, action: 'activated' });
            break;

          case 'deactivate':
            // Check if it's the last manager
            if (user.role === 'manager') {
              const activeManagerCount = await TenantUser.countDocuments({ 
                organization: organizationId, 
                role: 'manager',
                isActive: true
              });
              
              if (activeManagerCount <= 1) {
                results.push({ userId, success: false, error: 'Cannot deactivate the last active manager' });
                continue;
              }
            }
            
            user.isActive = false;
            await user.save();
            results.push({ userId, success: true, action: 'deactivated' });
            break;

          case 'delete':
            // Check if it's the last manager
            if (user.role === 'manager') {
              const managerCount = await TenantUser.countDocuments({ 
                organization: organizationId, 
                role: 'manager',
                isActive: true
              });
              
              if (managerCount <= 1) {
                results.push({ userId, success: false, error: 'Cannot delete the last active manager' });
                continue;
              }
            }
            
            await TenantUser.findByIdAndDelete(userId);
            results.push({ userId, success: true, action: 'deleted' });
            break;

          case 'update':
            if (data) {
              Object.assign(user, data);
              await user.save();
              results.push({ userId, success: true, action: 'updated' });
            } else {
              results.push({ userId, success: false, error: 'No data provided for update' });
            }
            break;

          default:
            results.push({ userId, success: false, error: 'Invalid action' });
        }
      } catch (error) {
        results.push({ userId, success: false, error: error.message });
      }
    }

    return successResponse(res, 200, 'Bulk operations completed', { results });
  } catch (error) {
    next(error);
  }
};

// Export users
const exportTenantUsers = async (req, res, next) => {
  try {
    const organizationId = req.params.organizationId || req.organization._id;
    const { format = 'csv' } = req.query;

    const users = await TenantUser.find({ organization: organizationId })
      .select('-password')
      .populate('organization', 'name slug')
      .populate('createdBy', 'firstName lastName email');

    if (format === 'csv') {
      const fields = [
        'firstName',
        'lastName',
        'email',
        'phone',
        'role',
        'department',
        'position',
        'isActive',
        'lastLogin',
        'createdAt'
      ];

      const opts = { fields };
      const parser = new Parser(opts);
      const csv = parser.parse(users);

      res.header('Content-Type', 'text/csv');
      res.attachment(`users-${organizationId}-${new Date().toISOString().split('T')[0]}.csv`);
      return res.send(csv);
    }

    return successResponse(res, 200, 'Users exported successfully', users);
  } catch (error) {
    next(error);
  }
};

// Get user statistics
const getTenantUserStats = async (req, res, next) => {
  try {
    const organizationId = req.organization._id;

    const [
      total,
      active,
      inactive,
      managers,
      hrs,
      employees,
      recentUsers
    ] = await Promise.all([
      TenantUser.countDocuments({ organization: organizationId }),
      TenantUser.countDocuments({ organization: organizationId, isActive: true }),
      TenantUser.countDocuments({ organization: organizationId, isActive: false }),
      TenantUser.countDocuments({ organization: organizationId, role: 'manager' }),
      TenantUser.countDocuments({ organization: organizationId, role: 'hr' }),
      TenantUser.countDocuments({ organization: organizationId, role: 'employee' }),
      TenantUser.find({ organization: organizationId })
        .select('firstName lastName email role createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
    ]);

    const stats = {
      total,
      active,
      inactive,
      roles: {
        managers,
        hrs,
        employees
      },
      recentUsers
    };

    return successResponse(res, 200, 'User statistics retrieved successfully', stats);
  } catch (error) {
    next(error);
  }
};

export {
  createTenantUser,
  getTenantUsers,
  getTenantUser,
  updateTenantUser,
  deleteTenantUser,
  toggleTenantUserStatus,
  bulkUpdateTenantUsers,
  exportTenantUsers,
  getTenantUserStats
};