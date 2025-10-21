import express from 'express';
const router = express.Router();

// Import controllers
import {
  registerTenantUser,
  loginTenantUser,
  refreshToken,
  logoutTenantUser,
  getTenantUserProfile,
  updateTenantUserProfile,
  changePassword
} from '../../controllers/tenant/auth.controller.js';

// Import middleware
import { validateSubdomain, extractOrganization } from '../../middleware/subdomain.middleware.js';
import { authenticateTenant } from '../../middleware/tenantAuth.middleware.js';
import { authenticateUser } from '../../middleware/auth.middleware.js'; // For super admin

// Public routes (with organization context)
router.post('/login', extractOrganization, loginTenantUser);
router.post('/refresh-token', refreshToken);

// Protected routes for super admin (to create tenant users)
router.post('/register', authenticateUser, registerTenantUser);

// Protected routes for tenant users (require subdomain validation)
router.use(validateSubdomain); // All routes below require valid subdomain

router.post('/logout', authenticateTenant, logoutTenantUser);
router.get('/profile', authenticateTenant, getTenantUserProfile);
router.put('/profile', authenticateTenant, updateTenantUserProfile);
router.put('/change-password', authenticateTenant, changePassword);

export default router;