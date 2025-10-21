import Organization from '../models/organization.model.js';
import { successResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/errorClasses.js';

// @desc    Create new organization
// @route   POST /api/organizations
// @access  Private (Super Admin only)
export const createOrganization = async (req, res, next) => {
  try {
    const { 
      name, 
      email, 
      description, 
      phone, 
      address, 
      website, 
      industry, 
      foundedYear, 
      size 
    } = req.body;
    
    // Required field validations
    if (!name) {
      throw new ApiError('Organization name is required', 400);
    }
    
    if (!email) {
      throw new ApiError('Organization email is required', 400);
    }
    
    // Email format validation
    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      throw new ApiError('Please provide a valid email address', 400);
    }
    
    // Website format validation (if provided)
    if (website) {
      const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
      if (!urlRegex.test(website)) {
        throw new ApiError('Please provide a valid website URL', 400);
      }
    }
    
    // Check if organization with this email already exists
    const existingOrg = await Organization.findOne({ email });
    if (existingOrg) {
      throw new ApiError('Organization with this email already exists', 409);
    }
    
    // Size validation (if provided)
    const validSizes = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];
    if (size && !validSizes.includes(size)) {
      throw new ApiError('Invalid organization size', 400);
    }
    
    // Add the admin ID as the creator
    req.body.createdBy = req.admin.id;
    
    // Create sanitized organization object with only allowed fields
    const organizationData = {
      name,
      email,
      createdBy: req.admin.id,
      ...(description && { description }),
      ...(phone && { phone }),
      ...(address && { address }),
      ...(website && { website }),
      ...(industry && { industry }),
      ...(foundedYear && { foundedYear }),
      ...(size && { size })
    };
    
    try {
      const organization = await Organization.create(organizationData);
      return successResponse(res, 201, 'Organization created successfully', organization);
    } catch (dbError) {
      // Handle specific database errors
      if (dbError.name === 'MongoServerError' && dbError.code === 11000) {
        // Duplicate key error (e.g., duplicate email)
        return next(new ApiError('Organization with this email already exists', 409));
      } else if (dbError.name === 'ValidationError') {
        // Mongoose validation error
        return next(new ApiError(dbError.message, 400));
      } else {
        // Log the unexpected database error for debugging
        console.error('Database error during organization creation:', dbError);
        return next(new ApiError('Failed to create organization due to database error', 500));
      }
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Get all organizations
// @route   GET /api/organizations
// @access  Private (Super Admin only)
export const getOrganizations = async (req, res, next) => {
  try {
    const organizations = await Organization.find();
    return successResponse(res, 200, 'Organizations retrieved successfully', organizations);
  } catch (error) {
    next(error);
  }
};

// @desc    Get single organization
// @route   GET /api/organizations/:id
// @access  Private (Super Admin only)
export const getOrganization = async (req, res, next) => {
  try {
    const organization = await Organization.findById(req.params.id);
    
    if (!organization) {
      throw new ApiError(`Organization not found with id of ${req.params.id}`, 404);
    }
    
    return successResponse(res, 200, 'Organization retrieved successfully', organization);
  } catch (error) {
    next(error);
  }
};

// @desc    Update organization
// @route   PUT /api/organizations/:id
// @access  Private (Super Admin only)
export const updateOrganization = async (req, res, next) => {
  try {
    const { 
      name, 
      email, 
      description, 
      phone, 
      address, 
      website, 
      industry, 
      foundedYear, 
      size,
      active
    } = req.body;
    
    let organization = await Organization.findById(req.params.id);
    
    if (!organization) {
      throw new ApiError(`Organization not found with id of ${req.params.id}`, 404);
    }
    
    // Email format validation (if provided)
    if (email) {
      const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
      if (!emailRegex.test(email)) {
        throw new ApiError('Please provide a valid email address', 400);
      }
      
      // Check if email is being changed and if it already exists
      if (email !== organization.email) {
        const existingOrg = await Organization.findOne({ email });
        if (existingOrg) {
          throw new ApiError('Organization with this email already exists', 409);
        }
      }
    }
    
    // Website format validation (if provided)
    if (website) {
      const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
      if (!urlRegex.test(website)) {
        throw new ApiError('Please provide a valid website URL', 400);
      }
    }
    
    // Validate size if provided
    if (size && !['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'].includes(size)) {
      throw new ApiError('Invalid organization size', 400);
    }
    
    // Create sanitized update object with only allowed fields
    const updateData = {
      ...(name && { name }),
      ...(email && { email }),
      ...(description && { description }),
      ...(phone && { phone }),
      ...(address && { address }),
      ...(website && { website }),
      ...(industry && { industry }),
      ...(foundedYear && { foundedYear }),
      ...(size && { size }),
      ...(active !== undefined && { active })
    };
    
    organization = await Organization.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    );
    
    return successResponse(res, 200, 'Organization updated successfully', organization);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete organization
// @route   DELETE /api/organizations/:id
// @access  Private (Super Admin only)
export const deleteOrganization = async (req, res, next) => {
  try {
    const organization = await Organization.findById(req.params.id);
    
    if (!organization) {
      throw new ApiError(`Organization not found with id of ${req.params.id}`, 404);
    }
    
    await organization.deleteOne();
    
    return successResponse(res, 200, 'Organization deleted successfully', {});
  } catch (error) {
    next(error);
  }
};