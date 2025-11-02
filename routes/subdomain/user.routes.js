import express from 'express';
import { validateSubdomain } from '../../middleware/subdomain.middleware.js';
import { verifyTenantToken, requireManager, requireHROrManager } from '../../middleware/tenantAuth.middleware.js';
import { createTenantUser } from '../../controllers/tenant/user.controller.js';
import TenantUser from '../../models/tenant/auth.model.js';

const router = express.Router();

// Apply subdomain validation to all routes
router.use(validateSubdomain);
router.use(verifyTenantToken);

// Create user (HR or Manager). HR limited to creating employees only.
router.post('/', requireHROrManager, async (req, res, next) => {
  try {
    const requesterRole = req.user?.role;
    if (requesterRole === 'hr') {
      // Force role to employee for HR requests
      req.body.role = 'employee';
    }
    return createTenantUser(req, res, next);
  } catch (error) {
    next(error);
  }
});

// Get all users in the organization (HR or Manager only)
router.get('/', requireHROrManager, async (req, res, next) => {
  try {
    const organization = req.organization;
    
    // Get users from the organization
    const users = await req.app.models.TenantUser.find({ 
      organization: organization._id,
      isActive: true
    }).select('-password');
    
    res.status(200).json({
      success: true,
      message: 'Users retrieved successfully',
      data: { users }
    });
  } catch (error) {
    next(error);
  }
});

// Get user by ID
router.get('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const organization = req.organization;
    
    const user = await req.app.models.TenantUser.findOne({
      _id: userId,
      organization: organization._id
    }).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'User retrieved successfully',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
});

// Update user (Manager only)
router.put('/:userId', requireHROrManager, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { 
      firstName, 
      lastName, 
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
      ifscCode,
      phone,
      email
    } = req.body;
    const organization = req.organization;
    
    const user = await TenantUser.findOne({
      _id: userId,
      organization: organization._id
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if email is being changed and already exists
    if (email && email !== user.email) {
      const existingUser = await TenantUser.findByOrganizationAndEmail(organization._id, email);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'Email already exists in this organization'
        });
      }
    }

    // Check if employeeId is being changed and already exists
    if (employeeId && employeeId !== user.employeeId) {
      const existingEmployee = await TenantUser.findOne({
        organization: organization._id,
        employeeId: employeeId,
        _id: { $ne: userId }
      });
      if (existingEmployee) {
        return res.status(409).json({
          success: false,
          message: 'Employee ID already exists in this organization'
        });
      }
    }
    
    // Update basic fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (role) user.role = role;
    if (department) user.department = department;
    if (position) user.position = position;
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
    
    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
});

export default router;