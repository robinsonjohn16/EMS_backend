import express from 'express';
import { validateSubdomain } from '../../middleware/subdomain.middleware.js';
import { verifyTenantToken, requireManager, requireHROrManager } from '../../middleware/tenantAuth.middleware.js';

const router = express.Router();

// Apply subdomain validation to all routes
router.use(validateSubdomain);
router.use(verifyTenantToken);

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
router.put('/:userId', requireManager, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, role, department, position, isActive } = req.body;
    const organization = req.organization;
    
    const user = await req.app.models.TenantUser.findOne({
      _id: userId,
      organization: organization._id
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Update fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (role) user.role = role;
    if (department) user.department = department;
    if (position) user.position = position;
    if (isActive !== undefined) user.isActive = isActive;
    
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