import express from 'express';
import { 
  loginTenantUser, 
  refreshToken,
  logoutTenantUser,
  getTenantUserProfile, 
  updateTenantUserProfile, 
  changePassword 
} from '../../controllers/tenant/auth.controller.js';
import { validateSubdomain, extractOrganization } from '../../middleware/subdomain.middleware.js';
import { authenticateTenant } from '../../middleware/tenantAuth.middleware.js';

const router = express.Router();

// Public routes (no auth required) - need organization context for login
router.post('/login', extractOrganization, loginTenantUser);
router.post('/refresh', refreshToken);

// Apply subdomain validation to protected routes
router.use(validateSubdomain);

// Protected routes (auth required)
router.post('/logout', authenticateTenant, logoutTenantUser);
router.get('/profile', authenticateTenant, getTenantUserProfile);
router.put('/profile', authenticateTenant, updateTenantUserProfile);
router.post('/change-password', authenticateTenant, changePassword);

export default router;