import express from 'express';
import * as employeeController from '../../controllers/tenant/employee.controller.js';
import * as employeeFieldController from '../../controllers/tenant/employeeField.controller.js';
import { authenticateUser } from '../../middleware/auth.middleware.js';
import { authenticateTenant } from '../../middleware/tenantAuth.middleware.js';
import { validateSubdomain } from '../../middleware/subdomain.middleware.js';
import {requireHROrManager} from '../../middleware/tenantAuth.middleware.js';

const router = express.Router();

// Apply middleware to all routes
router.use(validateSubdomain);
router.use(authenticateTenant);

// Employee Field Categories Routes
router.post('/fields/categories', employeeFieldController.createFieldCategory);
router.get('/fields/categories', employeeFieldController.getFieldCategories);
router.get('/fields/categories/:categoryId', employeeFieldController.getFieldCategory);
router.put('/fields/categories/:categoryId', employeeFieldController.updateFieldCategory);
router.delete('/fields/categories/:categoryId', employeeFieldController.deleteFieldCategory);

// Employee Field Routes
router.post('/fields/categories/:categoryId/fields', employeeFieldController.addField);
router.put('/fields/categories/:categoryId/fields/:fieldId', employeeFieldController.updateField);
router.delete('/fields/categories/:categoryId/fields/:fieldId', employeeFieldController.deleteField);
router.put('/fields/categories/:categoryId/reorder', employeeFieldController.reorderFields);

// Employee Details Routes
router.post('/', employeeController.upsertEmployeeDetails);
router.get('/', employeeController.getAllEmployees);
router.get('/stats', employeeController.getEmployeeStats);
router.get('/:employeeId', employeeController.getEmployeeDetails);
router.get('/user/:userId', employeeController.getEmployeeDetailsByUserId);
router.post('/submit-fields', employeeController.submitEmployeeFields);
router.put('/:employeeId/profile-settings', employeeController.updateProfileSettings);

router.post('/:employeeId/submit-for-approval', employeeController.submitForApproval);
router.post('/:employeeId/review', requireHROrManager, employeeController.reviewEmployeeDetails);
router.post('/pending-approvals', requireHROrManager, employeeController.getPendingApprovals);

export default router;