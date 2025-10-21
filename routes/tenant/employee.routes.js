import express from 'express';
import { 
  upsertEmployeeDetails,
  getEmployeeDetails,
  getEmployeeDetailsByUserId,
  getAllEmployees,
  submitEmployeeFields,
  getEmployeeStats,
  submitForApproval,
  reviewEmployeeDetails
} from '../../controllers/tenant/employee.controller.js';
import { authenticateTenant, requireHROrManager } from '../../middleware/tenantAuth.middleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateTenant);

// Employee routes
router.route('/')
  .post(requireHROrManager, upsertEmployeeDetails)
  .get(requireHROrManager, getAllEmployees);

router.route('/stats')
  .get(requireHROrManager, getEmployeeStats);

router.route('/submit')
  .post(submitEmployeeFields);

// Approval workflow routes
router.route('/:employeeId/submit-for-approval')
  .post(submitForApproval);

router.route('/:employeeId/review')
  .post(requireHROrManager, reviewEmployeeDetails);

router.route('/:employeeId')
  .get(getEmployeeDetails);

router.route('/user/:userId')
  .get(getEmployeeDetailsByUserId);

export default router;