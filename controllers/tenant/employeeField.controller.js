import EmployeeField from '../../models/tenant/employeeField.model.js';
import Employee from '../../models/tenant/employee.model.js';
import { successResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/errorClasses.js';

// Create a new field category
export const createFieldCategory = async (req, res, next) => {
  try {
    const { name, description, fields = [], order } = req.body;
    const organizationId = req.organization._id;
    const createdBy = req.user._id;

    // Validate required fields
    if (!name) {
      throw new ApiError('Category name is required', 400);
    }

    // Check if category with same name already exists
    const existingCategory = await EmployeeField.findOne({
      organizationId,
      name
    });

    if (existingCategory) {
      throw new ApiError('A category with this name already exists', 400);
    }

    // Create new category
    const fieldCategory = await EmployeeField.create({
      organizationId,
      name,
      description,
      fields,
      order,
      createdBy,
      updatedBy: createdBy
    });

    return successResponse(
      res,
      201,
      'Field category created successfully',
      fieldCategory
    );
  } catch (error) {
    next(error);
  }
};

// Get all field categories for an organization
export const getFieldCategories = async (req, res, next) => {
  try {
    const organizationId = req.organization._id;
    const userId = req.user._id;
    const includeUserData = req.query.includeUserData === 'true';

    const categories = await EmployeeField.find({ organizationId })
      .sort({ order: 1, name: 1 })
      .populate('createdBy', 'firstName lastName')
      .populate('updatedBy', 'firstName lastName');
    
    // Always fetch and include the user's data if userId is available
    if (userId) {
      const employee = await Employee.findOne({ 
        organizationId, 
        userId 
      });
      
      if (employee && employee.customFields) {
        // Create a deep copy of categories to avoid modifying the original
        const categoriesWithUserData = JSON.parse(JSON.stringify(categories));
        
        // Inject user data directly into each category's fields
        categoriesWithUserData.forEach(category => {
          if (category.fields && category.fields.length > 0) {
            category.fields.forEach(field => {
              const customFields = employee.customFields;
              
              // Check for field value in different possible locations
              if (customFields[field._id]) {
                field.value = customFields[field._id];
              } else if (customFields[field.name]) {
                field.value = customFields[field.name];
              } else if (customFields[category.name] && customFields[category.name][field.name]) {
                field.value = customFields[category.name][field.name];
              }
            });
          }
        });
        console.log(categoriesWithUserData, employee.customFields)
        // Also include the raw customFields for reference
        return successResponse(
          res,
          200,
          'Field categories with user data retrieved successfully',
          { 
            categories: categoriesWithUserData,
            userData: employee.customFields 
          }
        );
      }
    }

    return successResponse(
      res,
      200,
      'Field categories retrieved successfully',
      { categories }
    );
  } catch (error) {
    next(error);
  }
};

// Get a single field category by ID
export const getFieldCategory = async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const organizationId = req.organization._id;

    const category = await EmployeeField.findOne({
      _id: categoryId,
      organizationId
    })
      .populate('createdBy', 'firstName lastName')
      .populate('updatedBy', 'firstName lastName');

    if (!category) {
      throw new ApiError('Field category not found', 404);
    }

    return successResponse(
      res,
      200,
      'Field category retrieved successfully',
      category
    );
  } catch (error) {
    next(error);
  }
};

// Update a field category
export const updateFieldCategory = async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const { name, description, order, isActive } = req.body;
    const organizationId = req.organization._id;
    const updatedBy = req.user._id;

    // Find the category
    const category = await EmployeeField.findOne({
      _id: categoryId,
      organizationId
    });

    if (!category) {
      throw new ApiError('Field category not found', 404);
    }

    // Check if new name conflicts with existing category
    if (name && name !== category.name) {
      const existingCategory = await EmployeeField.findOne({
        organizationId,
        name,
        _id: { $ne: categoryId }
      });

      if (existingCategory) {
        throw new ApiError('A category with this name already exists', 400);
      }
    }

    // Update fields
    if (name) category.name = name;
    if (description !== undefined) category.description = description;
    if (order !== undefined) category.order = order;
    if (isActive !== undefined) category.isActive = isActive;
    
    category.updatedBy = updatedBy;

    await category.save();

    return successResponse(
      res,
      200,
      'Field category updated successfully',
      category
    );
  } catch (error) {
    next(error);
  }
};

// Delete a field category
export const deleteFieldCategory = async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const organizationId = req.organization._id;

    // Check if category exists
    const category = await EmployeeField.findOne({
      _id: categoryId,
      organizationId
    });

    if (!category) {
      throw new ApiError('Field category not found', 404);
    }

    // Check if any employees have data for this category
    const employeesWithData = await Employee.countDocuments({
      organizationId,
      [`customFields.${category.name}`]: { $exists: true }
    });

    if (employeesWithData > 0) {
      throw new ApiError(
        'Cannot delete category that has employee data. Deactivate it instead.',
        400
      );
    }

    await EmployeeField.deleteOne({ _id: categoryId });

    return successResponse(
      res,
      200,
      'Field category deleted successfully',
      { id: categoryId }
    );
  } catch (error) {
    next(error);
  }
};

// Add a field to a category
export const addField = async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const fieldData = req.body;
    const organizationId = req.organization._id;
    const updatedBy = req.user._id;

    // Validate required field properties
    if (!fieldData.name || !fieldData.label || !fieldData.type) {
      throw new ApiError('Field name, label, and type are required', 400);
    }

    // Find the category
    const category = await EmployeeField.findOne({
      _id: categoryId,
      organizationId
    });

    if (!category) {
      throw new ApiError('Field category not found', 404);
    }

    // Check if field with same name already exists
    const fieldExists = category.fields.some(field => field.name === fieldData.name);
    if (fieldExists) {
      throw new ApiError('A field with this name already exists in this category', 400);
    }

    // Add the new field
    category.fields.push(fieldData);
    category.updatedBy = updatedBy;

    await category.save();

    return successResponse(
      res,
      201,
      'Field added successfully',
      category
    );
  } catch (error) {
    next(error);
  }
};

// Update a field in a category
export const updateField = async (req, res, next) => {
  try {
    const { categoryId, fieldId } = req.params;
    const fieldData = req.body;
    const organizationId = req.organization._id;
    const updatedBy = req.user._id;

    // Find the category
    const category = await EmployeeField.findOne({
      _id: categoryId,
      organizationId
    });

    if (!category) {
      throw new ApiError('Field category not found', 404);
    }

    // Find the field
    const fieldIndex = category.fields.findIndex(field => field._id.toString() === fieldId);
    if (fieldIndex === -1) {
      throw new ApiError('Field not found', 404);
    }

    // Check if field name is being changed and if it conflicts
    if (fieldData.name && fieldData.name !== category.fields[fieldIndex].name) {
      const fieldExists = category.fields.some(
        (field, index) => index !== fieldIndex && field.name === fieldData.name
      );
      
      if (fieldExists) {
        throw new ApiError('A field with this name already exists in this category', 400);
      }
    }

    // Update the field
    Object.keys(fieldData).forEach(key => {
      category.fields[fieldIndex][key] = fieldData[key];
    });
    
    category.updatedBy = updatedBy;
    await category.save();

    return successResponse(
      res,
      200,
      'Field updated successfully',
      category
    );
  } catch (error) {
    next(error);
  }
};

// Delete a field from a category
export const deleteField = async (req, res, next) => {
  try {
    const { categoryId, fieldId } = req.params;
    const organizationId = req.organization._id;
    const updatedBy = req.user._id;

    // Find the category
    const category = await EmployeeField.findOne({
      _id: categoryId,
      organizationId
    });

    if (!category) {
      throw new ApiError('Field category not found', 404);
    }

    // Find the field
    const field = category.fields.id(fieldId);
    if (!field) {
      throw new ApiError('Field not found', 404);
    }

    // Check if any employees have data for this field
    const fieldPath = `customFields.${category.name}.${field.name}`;
    const employeesWithData = await Employee.countDocuments({
      organizationId,
      [fieldPath]: { $exists: true }
    });

    if (employeesWithData > 0) {
      throw new ApiError(
        'Cannot delete field that has employee data. Set isVisible to false instead.',
        400
      );
    }

    // Remove the field
    category.fields.pull(fieldId);
    category.updatedBy = updatedBy;
    
    await category.save();

    return successResponse(
      res,
      200,
      'Field deleted successfully',
      category
    );
  } catch (error) {
    next(error);
  }
};

// Reorder fields within a category
export const reorderFields = async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const { fieldIds } = req.body; // Array of field IDs in the desired order
    const organizationId = req.organization._id;
    const updatedBy = req.user._id;

    if (!Array.isArray(fieldIds)) {
      throw new ApiError('Field IDs must be an array', 400);
    }

    // Find the category
    const category = await EmployeeField.findOne({
      _id: categoryId,
      organizationId
    });

    if (!category) {
      throw new ApiError('Field category not found', 404);
    }

    // Validate that all field IDs exist in the category
    const existingIds = category.fields.map(field => field._id.toString());
    const allExist = fieldIds.every(id => existingIds.includes(id));
    
    if (!allExist || fieldIds.length !== category.fields.length) {
      throw new ApiError('Invalid field IDs provided', 400);
    }

    // Create a new array of fields in the specified order
    const reorderedFields = fieldIds.map(id => 
      category.fields.find(field => field._id.toString() === id)
    );

    // Update the fields array
    category.fields = reorderedFields;
    category.updatedBy = updatedBy;
    
    await category.save();

    return successResponse(
      res,
      200,
      'Fields reordered successfully',
      category
    );
  } catch (error) {
    next(error);
  }
};