import Employee from '../../models/tenant/employee.model.js';
import EmployeeField from '../../models/tenant/employeeField.model.js';
import TenantUser from '../../models/tenant/auth.model.js';
import { successResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/errorClasses.js';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';

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

    // Sync core identity fields to TenantUser
    if (baseInfo && typeof baseInfo === 'object') {
      const {
        employeeId: empId,
        joiningDate,
        gender,
        panNumber,
        aadhaarNumber,
        uanNumber,
        esicIpNumber,
        bankAccountNumber,
        ifscCode
      } = baseInfo;

      if (empId !== undefined && empId !== null && String(empId).trim() !== '') {
        const candidateId = String(empId).trim();
        if ((!user.employeeId || user.employeeId !== candidateId)) {
          const exists = await TenantUser.findOne({
            organization: organizationId,
            employeeId: candidateId,
            _id: { $ne: user._id }
          });
          if (exists) {
            throw new ApiError('Employee ID already exists in this organization', 409);
          }
          user.employeeId = candidateId;
        }
      } else if (!user.employeeId && user.role === 'employee') {
        user.employeeId = await TenantUser.generateEmployeeIdForOrg(organizationId);
      }

      if (joiningDate) user.dateOfJoining = new Date(joiningDate);
      if (gender) user.gender = gender;
      if (panNumber !== undefined) user.panNumber = panNumber;
      if (aadhaarNumber !== undefined) user.aadhaarNumber = aadhaarNumber;
      if (uanNumber !== undefined) user.uanNumber = uanNumber;
      if (esicIpNumber !== undefined) user.esicIpNumber = esicIpNumber;
      if (bankAccountNumber !== undefined) user.bankAccountNumber = bankAccountNumber;
      if (ifscCode !== undefined) user.ifscCode = ifscCode;
    }

    await user.save();

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
      console.log(users)
    }

    // Count total documents
    const total = await Employee.countDocuments(query);

    // Paginate results
    const employees = await Employee.find(query)
      .populate({
        path: 'userId',
        // select: 'firstName lastName email username role department position isActive',
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
    const { categoryName } = req.body;
    let { fields } = req.body;
    const organizationId = req.organization._id;
    const userId = req.user._id;
console.log(fields)
    // Validate required fields
    if (!categoryName) {
      throw new ApiError('Category name is required', 400);
    }

    // Parse fields from JSON string for multipart or use object
    if (typeof fields === 'string') {
      try {
        fields = JSON.parse(fields);
      } catch (e) {
        throw new ApiError('Fields must be valid JSON', 400);
      }
    }

    if (!fields || typeof fields !== 'object') {
      throw new ApiError('Fields must be provided as an object', 400);
    }
    
    // Build file map from req.files (multer memory storage)
    const fileMap = {};
    if (Array.isArray(req.files)) {
      for (const f of req.files) {
        const key = f.fieldname;
        if (!fileMap[key]) fileMap[key] = [];
        fileMap[key].push(f);
      }
    }
    
    // Validate presence of fields or uploaded files
    const fieldIds = Object.keys(fields);
    const hasUploadedFilesGlobal = Array.isArray(req.files) && req.files.length > 0;
    if (fieldIds.length === 0 && !hasUploadedFilesGlobal) {
      throw new ApiError('No fields or files provided for submission', 400);
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
    
    // Process each field in the submission (include file-only fields)
    const submissionFieldNames = Array.from(new Set([...Object.keys(fields), ...Object.keys(fileMap)]));
    for (const fieldName of submissionFieldNames) {
      const fieldValue = fields[fieldName];
      // Find field definition
      const fieldDef = category.fields.find(f => f._id.toString() === fieldName || f.name === fieldName);
      if (!fieldDef) {
        throw new ApiError(`Field "${fieldName}" does not exist in category "${categoryName}"`, 400);
      }


      // Block editing protected profile/base fields via self-service
      const protectedNames = new Set(['employeeid','dateofjoining','uannumber','esicipnumber','esicipnum']);
      const normalizedName = (fieldDef.name || '').toLowerCase().replace(/\s+/g, '');
      if (protectedNames.has(normalizedName)) {
        throw new ApiError(`Field "${fieldDef.name}" is not editable via self-service`, 403);
      }

      // Check if employee is allowed to edit this field
      if (!fieldDef.isEmployeeEditable) {
        throw new ApiError(`Field "${fieldName}" cannot be edited by employees`, 403);
      }
      
      const hasUploadedFiles = Array.isArray(fileMap[fieldDef.name]) && fileMap[fieldDef.name].length > 0;

      // Required validation
      if (fieldDef.required) {
        if (fieldDef.type === 'file' || fieldDef.type === 'image') {
          const isEmptyArray = Array.isArray(fieldValue) && fieldValue.length === 0;
          const isEmptyString = typeof fieldValue === 'string' && fieldValue.trim() === '';
          if (!hasUploadedFiles && (fieldValue === undefined || fieldValue === null || isEmptyString || isEmptyArray)) {
            throw new ApiError(`Field "${fieldDef.name}" is required and must include at least one file`, 400);
          }
        } else if (fieldValue === undefined || fieldValue === '') {
          throw new ApiError(`Field "${fieldDef.name}" is required`, 400);
        }
      }

      // Handle file/image fields via req.files, else validate non-file values
      if (fieldDef.type === 'file' || fieldDef.type === 'image') {
        if (hasUploadedFiles) {
            // Validate and persist uploaded files
            const acceptedList = typeof fieldDef.acceptedTypes === 'string' && fieldDef.acceptedTypes
              ? fieldDef.acceptedTypes.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
              : [];
            const allowedSet = new Set(acceptedList);
            const minMB = fieldDef.validation?.min;
            const maxMB = fieldDef.validation?.max;
            const maxFiles = fieldDef.validation?.maxFiles || 1;

            const files = fileMap[fieldDef.name];
            if (files.length > maxFiles) {
              throw new ApiError(`Too many files uploaded for "${fieldDef.name}". Max allowed is ${maxFiles}`, 400);
            }

            const newUrls = [];
            const orgId = req.organization?._id?.toString() || 'unknown_org';
            // Persist under backend/uploads which is served at /uploads
            const destDir = path.join(process.cwd(), 'uploads', 'employee_fields', orgId, employee._id.toString(), categoryName, fieldDef.name);
            fs.mkdirSync(destDir, { recursive: true });

            for (const f of files) {
              const sizeMB = f.size / (1024 * 1024);
              if (minMB && sizeMB < minMB) {
                throw new ApiError(`File too small for "${fieldDef.name}". Minimum is ${minMB} MB`, 400);
              }
              if (maxMB && sizeMB > maxMB) {
                throw new ApiError(`File too large for "${fieldDef.name}". Maximum is ${maxMB} MB`, 400);
              }
              if (allowedSet.size > 0) {
                const ext = path.extname(f.originalname).toLowerCase().replace('.', '');
                if (!allowedSet.has(ext)) {
                  throw new ApiError(`File type .${ext} not allowed for "${fieldDef.name}"`, 400);
                }
              }
              const timestamp = Date.now();
              const safeName = f.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
              const finalName = `${timestamp}_${safeName}`;
              const finalPath = path.join(destDir, finalName);
              fs.writeFileSync(finalPath, f.buffer);
              // Build URL consistent with existing upload route
              const rel = finalPath.split('backend').pop()?.replace(/\\/g, '/');
              const url = `/uploads${rel.replace('/uploads','')}`;
              newUrls.push(url);
            }

            // Merge with any existing URLs provided in fields (for multi-file updates)
            const existingArray = Array.isArray(fieldValue) ? fieldValue : (typeof fieldValue === 'string' ? [fieldValue] : []);
            for (const v of existingArray) {
              if (typeof v !== 'string') {
                throw new ApiError(`Invalid value for file field "${fieldDef.name}"`, 400);
              }
            }
            let combined = [...existingArray, ...newUrls];
            // De-duplicate and enforce maxFiles
            combined = Array.from(new Set(combined)).slice(0, maxFiles);

            existingCategoryData[fieldDef.name] = maxFiles > 1 ? combined : combined[0];
          } else {
            // No uploaded files; validate existing URL(s) if provided
            const values = Array.isArray(fieldValue) ? fieldValue : (typeof fieldValue === 'string' ? [fieldValue] : []);
            const maxFiles = fieldDef.validation?.maxFiles || 1;
            const isArray = maxFiles > 1;
            for (const v of values) {
              if (typeof v !== 'string') {
                throw new ApiError(`Invalid value for file field "${fieldDef.name}"`, 400);
              }
            }
            existingCategoryData[fieldDef.name] = isArray ? values : (values[0] || '');
          }
      } else {
        // Non-file fields: existing validation logic
        switch (fieldDef.type) {
          case 'number':
            if (isNaN(Number(fieldValue))) {
              throw new ApiError(`Field "${fieldDef.name}" must be a number`, 400);
            }
            break;
          case 'date':
            if (isNaN(Date.parse(fieldValue))) {
              throw new ApiError(`Field "${fieldDef.name}" must be a valid date`, 400);
            }
            break;
          case 'email':
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fieldValue)) {
              throw new ApiError(`Field "${fieldDef.name}" must be a valid email`, 400);
            }
            break;
          case 'phone':
            if (!/^\+?[0-9\s-]{7,}$/.test(fieldValue)) {
              throw new ApiError(`Field "${fieldDef.name}" must be a valid phone number`, 400);
            }
            break;
          case 'url':
            try {
              new URL(fieldValue);
            } catch (e) {
              throw new ApiError(`Field "${fieldDef.name}" must be a valid URL`, 400);
            }
            break;
          case 'select':
          case 'radio':
            if (Array.isArray(fieldDef.options) && fieldDef.options.length > 0) {
              const allowed = fieldDef.options.map(o => String(o).toLowerCase());
              const val = String(fieldValue || '').toLowerCase();
              if (val && !allowed.includes(val)) {
                throw new ApiError(`Field "${fieldDef.name}" must be one of: ${fieldDef.options.join(', ')}`, 400);
              }
            }
            break;
          default:
            // No extra validation for other types
            break;
        }

        // Set non-file field value
        existingCategoryData[fieldDef.name] = fieldValue;
      }
    }

    // Update employee record
    employee.customFields.set(categoryName, existingCategoryData);
    employee.updatedBy = userId;
   // Ensure Mongoose persists Map changes reliably
   if (typeof employee.markModified === 'function') {
     employee.markModified('customFields');
   }
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

// Save uploaded files for a specific field and update employee record
export const uploadEmployeeFieldFiles = async (req, res, next) => {
  try {
    const organizationId = req.organization._id;
    const { employeeId, categoryName, fieldName } = req.params;
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      throw new ApiError('No files uploaded', 400);
    }

    // Find employee
    const employee = await Employee.findOne({ _id: employeeId, organizationId });
    if (!employee) {
      throw new ApiError('Employee not found', 404);
    }

    // Validate category and field
    const category = await EmployeeField.findOne({ organizationId, name: categoryName });
    if (!category) {
      throw new ApiError(`Category "${categoryName}" does not exist`, 400);
    }
    const fieldDef = category.fields.find((f) => f.name === fieldName);
    if (!fieldDef) {
      throw new ApiError(`Field "${fieldName}" does not exist in category "${categoryName}"`, 400);
    }

    // Validate files against field definition
    const acceptedList = typeof fieldDef.acceptedTypes === 'string' && fieldDef.acceptedTypes
      ? fieldDef.acceptedTypes.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
      : [];
    const allowedSet = new Set(acceptedList);
    const minMB = fieldDef.validation?.min;
    const maxMB = fieldDef.validation?.max;
    const maxFiles = fieldDef.validation?.maxFiles || 1;

    if (files.length > maxFiles) {
      // cleanup uploaded files
      for (const f of files) { try { fs.unlinkSync(f.path); } catch (e) {} }
      throw new ApiError(`You can upload up to ${maxFiles} file(s) for ${fieldName}`, 400);
    }

    const invalids = [];
    for (const f of files) {
      const ext = path.extname(f.originalname).replace('.', '').toLowerCase();
      const sizeMB = f.size / (1024 * 1024);
      const typeIsImage = fieldDef.type === 'image';
      const typeOk = allowedSet.size === 0
        ? (typeIsImage ? (f.mimetype?.startsWith('image/') || ['jpg','jpeg','png','gif','webp'].includes(ext)) : true)
        : allowedSet.has(ext);
      if (!typeOk) invalids.push(`${f.originalname} (invalid type)`);
      if (minMB && sizeMB < minMB) invalids.push(`${f.originalname} below ${minMB}MB`);
      if (maxMB && sizeMB > maxMB) invalids.push(`${f.originalname} exceeds ${maxMB}MB`);
    }

    if (invalids.length) {
      // cleanup uploaded files
      for (const f of files) { try { fs.unlinkSync(f.path); } catch (e) {} }
      throw new ApiError(`Upload validation failed: ${invalids.join('; ')}`, 400);
    }

    // Build public URLs and update employee customFields
    const urls = files.map((f) => {
      // f.path points to backend/uploads/<org>/<employee>/<category>/<field>/<filename>
      const rel = f.path.split('backend').pop()?.replace(/\\/g, '/');
      return `/uploads${rel.replace('/uploads', '')}`;
    });

    const existingCategoryData = employee.customFields.get(categoryName) || {};
    existingCategoryData[fieldName] = maxFiles > 1 ? urls : urls[0];
    employee.customFields.set(categoryName, existingCategoryData);
    await employee.save();

    return successResponse(res, 200, 'Files uploaded successfully', { files: urls });
  } catch (error) {
    next(error);
  }
};

export const requestUnlockFields = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { reason } = req.body || {};
    const orgId = req.organization?._id || req.organizationId;

    const employee = await Employee.findOne({ _id: employeeId, organizationId: orgId });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    // Allow only the employee or HR/Manager to request unlock
    const isSelf = String(employee.userId) === String(req.user?._id);
    const isPrivileged = Array.isArray(req.user?.roles) && (req.user.roles.includes('hr') || req.user.roles.includes('manager'));
    if (!isSelf && !isPrivileged) {
      return res.status(403).json({ message: 'Not authorized to request unlock for this employee' });
    }

    if (employee.unlockStatus?.status === 'requested') {
       return res.status(400).json({ message: 'Unlock already requested' });
     }

    employee.unlockStatus = {
      status: 'requested',
      requestedAt: new Date(),
      requestedBy: req.user?._id,
      reason: reason || ''
    };
    await employee.save();

    return res.status(200).json({ message: 'Unlock requested', unlockStatus: employee.unlockStatus });
  } catch (err) {
    console.error('requestUnlockFields error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const reviewUnlockRequest = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { action, comments } = req.body;
    const orgId = req.organization?._id || req.organizationId;

    const employee = await Employee.findOne({ _id: employeeId, organizationId: orgId });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    if (employee.unlockStatus?.status !== 'requested') {
      return res.status(400).json({ message: 'No pending unlock request' });
    }

    const now = new Date();
    if (action === 'approve') {
      employee.unlockStatus.status = 'approved';
      employee.unlockStatus.reviewedAt = now;
      employee.unlockStatus.reviewedBy = req.user?._id;
      // Move back to draft so employee can edit non-basic fields
      employee.approvalStatus.status = 'draft';
      employee.approvalStatus.reviewComments = comments || employee.approvalStatus.reviewComments;
      // Clear locked fields so UI allows edits
      employee.lockedFields = [];
    } else if (action === 'reject') {
      employee.unlockStatus.status = 'rejected';
      employee.unlockStatus.reviewedAt = now;
      employee.unlockStatus.reviewedBy = req.user?._id;
      employee.approvalStatus.reviewComments = comments || employee.approvalStatus.reviewComments;
    } else {
      return res.status(400).json({ message: 'Invalid action. Use approve or reject.' });
    }

    await employee.save();
    return res.status(200).json({ message: 'Unlock review updated', unlockStatus: employee.unlockStatus, approvalStatus: employee.approvalStatus });
  } catch (err) {
    console.error('reviewUnlockRequest error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const getPendingUnlockRequests = async (req, res) => {
  try {
    const orgId = req.organization?._id || req.organizationId;
    const pending = await Employee.find({ organizationId: orgId, 'unlockStatus.status': 'requested' })
      .populate('userId', 'firstName lastName email')
      .select('userId approvalStatus unlockStatus');
    return res.status(200).json(pending);
  } catch (err) {
    console.error('getPendingUnlockRequests error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};