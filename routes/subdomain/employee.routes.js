import express from 'express';
import * as employeeController from '../../controllers/tenant/employee.controller.js';
import { requestUnlockFields, reviewUnlockRequest, getPendingUnlockRequests } from '../../controllers/tenant/employee.controller.js';
import * as employeeFieldController from '../../controllers/tenant/employeeField.controller.js';
import { authenticateUser } from '../../middleware/auth.middleware.js';
import { authenticateTenant } from '../../middleware/tenantAuth.middleware.js';
import { validateSubdomain } from '../../middleware/subdomain.middleware.js';
import {requireHROrManager} from '../../middleware/tenantAuth.middleware.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Apply middleware to all routes
router.use(validateSubdomain);
router.use(authenticateTenant);

// Multer storage for employee field uploads (per org/user/category/field)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const orgId = req.organization?._id?.toString() || 'unknown_org';
    const { employeeId, categoryName, fieldName } = req.params;
    const dest = path.join(process.cwd(), 'uploads', 'employee_fields', orgId, employeeId, categoryName.split(' ').join('-'), fieldName.split(' ').join('-'));
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}_${safeName}`);
  }
});
const upload = multer({ storage });

// Memory storage for unified submit-fields (files handled in controller)
const submitMemoryStorage = multer.memoryStorage();
const uploadSubmit = multer({ storage: submitMemoryStorage });

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
// Use multipart for unified category submission (fields + files)
router.post('/submit-fields', uploadSubmit.any(), employeeController.submitEmployeeFields);
router.put('/:employeeId/profile-settings', employeeController.updateProfileSettings);

// Upload files for a specific field
router.post('/:employeeId/upload/:categoryName/:fieldName', upload.array('files', 10), employeeController.uploadEmployeeFieldFiles);

router.post('/:employeeId/submit-for-approval', employeeController.submitForApproval);
router.post('/:employeeId/review', requireHROrManager, employeeController.reviewEmployeeDetails);
router.post('/pending-approvals', requireHROrManager, employeeController.getPendingApprovals);

// Request unlock of fields by employee
router.post('/:employeeId/request-unlock', authenticateTenant, requestUnlockFields);

// HR/Manager review unlock requests
router.post('/:employeeId/unlock-review', requireHROrManager, reviewUnlockRequest);

// List pending unlock requests
router.get('/pending-unlock-requests', requireHROrManager, getPendingUnlockRequests);
router.post('/:employeeId/review', requireHROrManager, employeeController.reviewEmployeeDetails);
router.post('/pending-approvals', requireHROrManager, employeeController.getPendingApprovals);

export default router;