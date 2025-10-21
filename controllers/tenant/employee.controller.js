import Employee from '../../models/tenant/employee.model.js';
import EmployeeField from '../../models/tenant/employeeField.model.js';
import TenantUser from '../../models/tenant/auth.model.js';
import { successResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/errorClasses.js';
import mongoose from 'mongoose';

// Create or update employee details
export const upsertEmployeeDetails = async (req, res, next) => {
  try {
    const { userId, baseInfo, customFields } = req.body;
    const organizationId = req.organization._id;
    const updatedBy = req.user._id;

    // Validate user exists
    const user = await TenantUser.findOne({
      _id: userId,
      organization: organizationId
    });

    if (!user) {
      throw new ApiError('User not found', 404);
    }

    // Find existing employee record or create new one
    let employee = await Employee.findOne({
      organizationId,
      userId
    });

    if (!employee) {
      // Create new employee record
      employee = new Employee({
        organizationId,
        userId,
        baseInfo: baseInfo || {},
        customFields: new Map(),
        createdBy: updatedBy,
        updatedBy
      });
    } else {
      // Update existing record
      if (baseInfo) {
        employee.baseInfo = { ...employee.baseInfo, ...baseInfo };
      }
      employee.updatedBy = updatedBy;
    }

    // Process custom fields if provided
    if (customFields && typeof customFields === 'object') {
      // Get all field categories for validation
      const categories = await EmployeeField.find({ organizationId });
      const categoryMap = new Map(categories.map(cat => [cat.name, cat]));

      // Process each category of custom fields
      for (const [categoryName, fields] of Object.entries(customFields)) {
        // Validate category exists
        const category = categoryMap.get(categoryName);
        if (!category) {
          throw new ApiError(`Category "${categoryName}" does not exist`, 400);
        }

        // Get existing category data or initialize new
        const existingCategoryData = employee.customFields.get(categoryName) || {};
        
        // Process each field in the category
        for (const [fieldName, fieldValue] of Object.entries(fields)) {
          // Find field definition
          const fieldDef = category.fields.find(f => f.name === fieldName);
          if (!fieldDef) {
            throw new ApiError(`Field "${fieldName}" does not exist in category "${categoryName}"`, 400);
          }

          // Check if HR is allowed to edit this field
          const isHR = req.user.role === 'hr' || req.user.role === 'manager';
          const isFieldLocked = employee.lockedFields.includes(`${categoryName}.${fieldName}`);
          
          if (isHR && isFieldLocked && !fieldDef.isHREditable) {
            throw new ApiError(`Field "${fieldName}" cannot be edited by HR after employee submission`, 403);
          }

          // Update the field value
          existingCategoryData[fieldName] = fieldValue;
        }

        // Update the category in customFields map
        employee.customFields.set(categoryName, existingCategoryData);
      }
    }

    await employee.save();

    return successResponse(
      res,
      200,
      'Employee details updated successfully',
      employee
    );
  } catch (error) {
    next(error);
  }
};

// Get employee details
export const getEmployeeDetails = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const organizationId = req.organization._id;
    // Find employee by ID
    const employee = await Employee.findOne({
      userId,
      organizationId
    }).populate('userId', 'firstName lastName email username role department position');
    if (!employee) {
      throw new ApiError('Employee details not found', 404);
    }

    // Check permissions - HR/Manager can view all, employees can only view their own
    const isHR = req.user.role === 'hr' || req.user.role === 'manager';
    const isSelf = employee.userId._id.toString() === req.user._id.toString();

    if (!isHR && !isSelf) {
      throw new ApiError('You do not have permission to view this employee\'s details', 403);
    }
    console.log(employee)

    return successResponse(
      res,
      200,
      'Employee details retrieved successfully',
      [employee]
    );
  } catch (error) {
    next(error);
  }
};

// Get employee details by user ID
export const getEmployeeDetailsByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const organizationId = req.organization._id;

    // Find employee by user ID
    const employee = await Employee.findOne({
      userId,
      organizationId
    }).populate('userId', 'firstName lastName email username role department position');

    if (!employee) {
      throw new ApiError('Employee details not found', 404);
    }

    // Check permissions - HR/Manager can view all, employees can only view their own
    const isHR = req.user.role === 'hr' || req.user.role === 'manager';
    const isSelf = userId === req.user._id.toString();

    if (!isHR && !isSelf) {
      throw new ApiError('You do not have permission to view this employee\'s details', 403);
    }

    return successResponse(
      res,
      200,
      'Employee details retrieved successfully',
      {
        employee,
        profileSettings: employee.profileSettings || {
          canEditProfile: true,
          canChangePassword: true
        }
      }
    );
  } catch (error) {
    next(error);
  }
};

// Update employee profile settings
export const updateProfileSettings = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    
    // Validate req.body exists
    if (!req.body || typeof req.body !== 'object') {
      throw new ApiError('Request body is required', 400);
    }
    
    const { canEditProfile, canChangePassword } = req.body;
    const organizationId = req.organization._id;

    // Verify the user has HR or manager role
    if (req.user.role !== 'hr' && req.user.role !== 'manager') {
      throw new ApiError('Unauthorized to update profile settings', 403);
    }

    const employee = await Employee.findOne({
      _id: employeeId,
      organizationId
    });

    if (!employee) {
      throw new ApiError('Employee not found', 404);
    }

    // Update profile settings
    employee.profileSettings = {
      canEditProfile: canEditProfile !== undefined ? canEditProfile : employee.profileSettings?.canEditProfile || true,
      canChangePassword: canChangePassword !== undefined ? canChangePassword : employee.profileSettings?.canChangePassword || true
    };

    await employee.save();

    return successResponse(
      res,
      200,
      'Profile settings updated successfully',
      { profileSettings: employee.profileSettings }
    );
  } catch (error) {
    next(error);
  }
};

// Get all employees with details
export const getAllEmployees = async (req, res, next) => {
  try {
    const organizationId = req.organization._id;
    const { page = 1, limit = 10, search, status } = req.query;

    // Build query
    const query = { organizationId };

    // Add status filter if provided and not 'undefined'
    if (status && status !== 'undefined') {
      query['baseInfo.status'] = status;
    }

    // Add search filter if provided
    if (search) {
      // We need to join with the user collection to search by name/email
      const users = await TenantUser.find({
        organization: organizationId,
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      query.userId = { $in: users.map(u => u._id) };
    }

    // Count total documents
    const total = await Employee.countDocuments(query);

    // Paginate results
    const employees = await Employee.find(query)
      .populate({
        path: 'userId',
        select: 'firstName lastName email username role department position',
        model: 'TenantUser'
      })
      .sort({ 'baseInfo.joiningDate': -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const totalActive = await Employee.countDocuments({
      ...query,
      'baseInfo.status': 'active'
    });
    
    const totalInactive = await Employee.countDocuments({
      ...query,
      'baseInfo.status': 'inactive'
    });
    const totalPendingDetails = await Employee.countDocuments({
      ...query,
      'approvalStatus.status': 'submitted'
    });

    return successResponse(
      res,
      200,
      'Employees retrieved successfully',
      {
        employees,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        },
        stats: {
          total: totalActive + totalInactive,
          active: totalActive,
          inactive: totalInactive,
          pendingDetails: totalPendingDetails
        }
      }
    );
  } catch (error) {
    next(error);
  }
};

// Submit employee fields (for employee self-service)
export const submitEmployeeFields = async (req, res, next) => {
  try {
    const { categoryName, fields } = req.body;
    const organizationId = req.organization._id;
    const userId = req.user._id;

    // Validate required fields
    if (!categoryName) {
      throw new ApiError('Category name is required', 400);
    }

    if (!fields || typeof fields !== 'object') {
      throw new ApiError('Fields must be provided as an object', 400);
    }
    
    // Validate only fields from the specified category
    const fieldIds = Object.keys(fields);
    if (fieldIds.length === 0) {
      throw new ApiError('No fields provided for submission', 400);
    }

    // Validate category exists
    const category = await EmployeeField.findOne({
      organizationId,
      name: categoryName
    });

    if (!category) {
      throw new ApiError(`Category "${categoryName}" does not exist`, 404);
    }

    // Find employee record
    let employee = await Employee.findOne({
      organizationId,
      userId
    });

    if (!employee) {
      // Create new employee record if it doesn't exist
      employee = new Employee({
        organizationId,
        userId,
        baseInfo: {},
        customFields: new Map(),
        createdBy: userId,
        updatedBy: userId
      });
    }

    // Check if employee has pending approval - prevent updates if so
    if (employee.approvalStatus && employee.approvalStatus.status === 'submitted') {
      throw new ApiError('Cannot update fields while approval is pending', 403);
    }

    // Get existing category data or initialize new
    const existingCategoryData = employee.customFields.get(categoryName) || {};
    
    // Process each field in the submission
    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      // Find field definition
      const fieldDef = category.fields.find(f => f._id.toString() === fieldName || f.name === fieldName);
      if (!fieldDef) {
        throw new ApiError(`Field "${fieldName}" does not exist in category "${categoryName}"`, 400);
      }

      // Check if employee is allowed to edit this field
      if (!fieldDef.isEmployeeEditable) {
        throw new ApiError(`Field "${fieldName}" cannot be edited by employees`, 403);
      }
      
      // Validate field value based on type
      if (fieldDef.required && (fieldValue === undefined || fieldValue === "")) {
        throw new ApiError(`Field "${fieldDef.name}" is required`, 400);
      }
      
      // Number validation
      if (fieldDef.type === "number" && fieldValue !== "" && fieldValue !== undefined) {
        const numValue = Number(fieldValue);
        if (isNaN(numValue)) {
          throw new ApiError(`Field "${fieldDef.name}" must be a valid number`, 400);
        }
        if (fieldDef.minValue !== undefined && numValue < fieldDef.minValue) {
          throw new ApiError(`Field "${fieldDef.name}" must be at least ${fieldDef.minValue}`, 400);
        }
        if (fieldDef.maxValue !== undefined && numValue > fieldDef.maxValue) {
          throw new ApiError(`Field "${fieldDef.name}" must be at most ${fieldDef.maxValue}`, 400);
        }
      }
      
      // Date validation
      if (fieldDef.type === "date" && fieldValue) {
        const dateValue = new Date(fieldValue);
        if (isNaN(dateValue.getTime())) {
          throw new ApiError(`Field "${fieldDef.name}" must be a valid date`, 400);
        }
        if (fieldDef.minDate && new Date(fieldDef.minDate) > dateValue) {
          throw new ApiError(`Field "${fieldDef.name}" must be after ${new Date(fieldDef.minDate).toISOString().split('T')[0]}`, 400);
        }
        if (fieldDef.maxDate && new Date(fieldDef.maxDate) < dateValue) {
          throw new ApiError(`Field "${fieldDef.name}" must be before ${new Date(fieldDef.maxDate).toISOString().split('T')[0]}`, 400);
        }
      }

      // Email validation
      if (fieldDef.type === "email" && fieldValue) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(fieldValue)) {
          throw new ApiError(`Field "${fieldDef.name}" must be a valid email address`, 400);
        }
      }

      // Phone validation
      if (fieldDef.type === "phone" && fieldValue) {
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        if (!phoneRegex.test(fieldValue.replace(/[\s\-\(\)]/g, ''))) {
          throw new ApiError(`Field "${fieldDef.name}" must be a valid phone number`, 400);
        }
      }

      // URL validation
      if (fieldDef.type === "url" && fieldValue) {
        try {
          new URL(fieldValue);
        } catch (error) {
          throw new ApiError(`Field "${fieldDef.name}" must be a valid URL`, 400);
        }
      }

      // File validation
      if (fieldDef.type === "file" && fieldValue) {
        // Basic file validation - in a real implementation, you'd validate file size, type, etc.
        if (typeof fieldValue !== "string" || fieldValue.trim() === "") {
          throw new ApiError(`Field "${fieldDef.name}" must contain a valid file reference`, 400);
        }
      }

      // Update the field value using field name instead of field ID
      existingCategoryData[fieldDef.name] = fieldValue;
      
      // Add to filled fields if not already there
      const fieldPath = `${categoryName}.${fieldDef.name}`;
      if (!employee.filledFields.includes(fieldPath)) {
        employee.filledFields.push(fieldPath);
      }
      
      // Add to locked fields if not already there
      if (!employee.lockedFields.includes(fieldPath)) {
        employee.lockedFields.push(fieldPath);
      }
    }

    // Update the category in customFields map
    employee.customFields.set(categoryName, existingCategoryData);
    
    // Mark the customFields as modified so Mongoose saves the changes
    employee.markModified('customFields');
    employee.updatedBy = userId;

    await employee.save();

    return successResponse(
      res,
      200,
      'Employee fields submitted successfully',
      employee
    );
  } catch (error) {
    next(error);
  }
};

// Get employee statistics
export const getEmployeeStats = async (req, res, next) => {
  try {
    const organizationId = req.organization._id;

    const [
      total,
      active,
      inactive,
      terminated,
      recentEmployees
    ] = await Promise.all([
      Employee.countDocuments({ organizationId }),
      Employee.countDocuments({ organizationId, 'baseInfo.status': 'active' }),
      Employee.countDocuments({ organizationId, 'baseInfo.status': 'inactive' }),
      Employee.countDocuments({ organizationId, 'baseInfo.status': 'terminated' }),
      Employee.find({ organizationId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('userId', 'firstName lastName email role')
    ]);

    const stats = {
      total,
      status: {
        active,
        inactive,
        terminated
      },
      recentEmployees
    };

    return successResponse(
      res,
      200,
      'Employee statistics retrieved successfully',
      stats
    );
  } catch (error) {
    next(error);
  }
};

// Submit employee details for HR approval
export const submitForApproval = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const organizationId = req.organization._id;
    const userId = req.user._id;

    // Find the employee record
    const employee = await Employee.findOne({
      _id: employeeId,
      organizationId
    });

    if (!employee) {
      throw new ApiError('Employee not found', 404);
    }

    // Check if employee belongs to the current user (employees can only submit their own details)
    if (employee.userId.toString() !== userId.toString() && req.user.role !== 'hr' && req.user.role !== 'admin') {
      throw new ApiError('You can only submit your own details for approval', 403);
    }

    // Check if already submitted or approved
    if (employee.approvalStatus.status === 'submitted') {
      throw new ApiError('Employee details are already submitted for approval', 400);
    }

    if (employee.approvalStatus.status === 'approved') {
      throw new ApiError('Employee details are already approved', 400);
    }

    // Update approval status
    employee.approvalStatus.status = 'submitted';
    employee.approvalStatus.submittedAt = new Date();
    employee.approvalStatus.submittedBy = userId;
    employee.approvalStatus.reviewedAt = undefined;
    employee.approvalStatus.reviewedBy = undefined;
    employee.approvalStatus.reviewComments = undefined;

    await employee.save();

    return successResponse(
      res,
      200,
      'Employee details submitted for approval successfully',
      {
        approvalStatus: employee.approvalStatus
      }
    );
  } catch (error) {
    next(error);
  }
};

// HR approve or reject employee details
export const reviewEmployeeDetails = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { action, comments } = req.body; // action: 'approve' or 'reject'
    const organizationId = req.organization._id;
    const reviewerId = req.user._id;

    // Validate action
    if (!['approve', 'reject'].includes(action)) {
      throw new ApiError('Invalid action. Must be "approve" or "reject"', 400);
    }

    // Check if user has HR or admin role
    if (!['hr', 'admin'].includes(req.user.role)) {
      throw new ApiError('Only HR or Admin can review employee details', 403);
    }

    // Find the employee record
    const employee = await Employee.findOne({
      _id: employeeId,
      organizationId
    }).populate('userId', 'firstName lastName email');

    if (!employee) {
      throw new ApiError('Employee not found', 404);
    }

    // Check if employee details are submitted for review
    if (employee.approvalStatus.status !== 'submitted') {
      throw new ApiError('Employee details are not submitted for review', 400);
    }

    // Update approval status
    employee.approvalStatus.status = action === 'approve' ? 'approved' : 'rejected';
    employee.approvalStatus.reviewedAt = new Date();
    employee.approvalStatus.reviewedBy = reviewerId;
    employee.approvalStatus.reviewComments = comments || '';

    await employee.save();

    return successResponse(
      res,
      200,
      `Employee details ${action}d successfully`,
      {
        employee: {
          _id: employee._id,
          userId: employee.userId,
          approvalStatus: employee.approvalStatus
        }
      }
    );
  } catch (error) {
    next(error);
  }
};

// Get pending approvals for HR
export const getPendingApprovals = async (req, res, next) => {
  try {
    const organizationId = req.organization._id;

    // Check if user has HR or admin role
    if (!['hr', 'admin'].includes(req.user.role)) {
      throw new ApiError('Only HR or Admin can view pending approvals', 403);
    }

    const pendingApprovals = await Employee.find({
      organizationId,
      'approvalStatus.status': 'submitted'
    })
    .populate('userId', 'firstName lastName email')
    .populate('approvalStatus.submittedBy', 'firstName lastName')
    .sort({ 'approvalStatus.submittedAt': -1 });

    return successResponse(
      res,
      200,
      'Pending approvals retrieved successfully',
      pendingApprovals
    );
  } catch (error) {
    next(error);
  }
};