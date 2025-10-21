import express from 'express';
const router = express.Router();
import * as leaveController from '../../controllers/tenant/leave.controller.js';
import { authenticateTenant as tenantAuth } from '../../middleware/tenantAuth.middleware.js';

// Employee leave routes
router.get('/employee/:employeeId', tenantAuth, leaveController.getEmployeeLeaves);
router.post('/employee/:employeeId/:organizationId/apply', tenantAuth, leaveController.applyLeave);
router.get('/quota/:employeeId/:organizationId', tenantAuth, leaveController.getLeaveQuota);

// HR leave management routes
router.get('/organization/:organizationId', tenantAuth, leaveController.getOrganizationLeaves);
router.put('/process/:leaveId', tenantAuth, leaveController.processLeaveRequest);
router.put('/cancel/:leaveId', tenantAuth, leaveController.cancelLeave);
router.put('/quota/:employeeId/:organizationId', tenantAuth, leaveController.updateLeaveQuota);

export default router;