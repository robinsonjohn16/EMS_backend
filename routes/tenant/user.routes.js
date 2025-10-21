import express from 'express';
import {
  createTenantUser,
  getTenantUsers,
  getTenantUser,
  updateTenantUser,
  deleteTenantUser,
  toggleTenantUserStatus,
  bulkUpdateTenantUsers,
  exportTenantUsers,
  getTenantUserStats
} from '../../controllers/tenant/user.controller.js';

// Import middleware
import { validateSubdomain, extractOrganization } from '../../middleware/subdomain.middleware.js';
import { authenticateTenant, requireRole } from '../../middleware/tenantAuth.middleware.js';
import { authenticateUser } from '../../middleware/auth.middleware.js'; // For super admin

const router = express.Router();

// All routes require authentication and organization context
router.use(extractOrganization);

// Routes accessible by super admin (without subdomain validation)
router.post('/', authenticateUser, createTenantUser); // Super admin can create users
router.get('/export/:organizationId', authenticateUser, exportTenantUsers); // Super admin can export

// Routes requiring subdomain validation (tenant users)
router.use(validateSubdomain);

// User management routes (require manager or hr role)
router.get('/', authenticateTenant, requireRole(['manager', 'hr']), getTenantUsers);
router.get('/stats', authenticateTenant, requireRole(['manager', 'hr']), getTenantUserStats);
router.get('/:userId', authenticateTenant, requireRole(['manager', 'hr']), getTenantUser);
router.put('/:userId', authenticateTenant, requireRole(['manager', 'hr']), updateTenantUser);
router.delete('/:userId', authenticateTenant, requireRole(['manager']), deleteTenantUser);
router.patch('/:userId/status', authenticateTenant, requireRole(['manager', 'hr']), toggleTenantUserStatus);
router.post('/bulk-update', authenticateTenant, requireRole(['manager']), bulkUpdateTenantUsers);
router.get('/export/csv', authenticateTenant, requireRole(['manager', 'hr']), exportTenantUsers);

export default router;