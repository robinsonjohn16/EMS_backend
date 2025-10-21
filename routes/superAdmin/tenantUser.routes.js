import express from 'express';
import {
  createTenantUser,
  getAllTenantUsers,
  getTenantUserById,
  updateTenantUser,
  deleteTenantUser,
  toggleTenantUserStatus,
  getTenantUsersByOrganization
} from '../../controllers/superAdmin/tenantUser.controller.js';
import { protect } from '../../middleware/auth.middleware.js';

const router = express.Router();

// Apply super admin authentication to all routes
router.use(protect);

// Tenant user management routes
router.route('/')
  .post(createTenantUser)      // Create new tenant user
  .get(getAllTenantUsers);     // Get all tenant users with filtering

router.route('/:userId')
  .get(getTenantUserById)      // Get specific tenant user
  .put(updateTenantUser)       // Update tenant user
  .delete(deleteTenantUser);   // Delete tenant user

// Toggle user status
router.patch('/:userId/toggle-status', toggleTenantUserStatus);

// Get users by organization
router.get('/organization/:organizationId', getTenantUsersByOrganization);

export default router;