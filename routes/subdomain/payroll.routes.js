import express from 'express';
import { validateSubdomain } from '../../middleware/subdomain.middleware.js';
import { authenticateTenant, requireHROrManager } from '../../middleware/tenantAuth.middleware.js';
import {
  getCompensation,
  upsertCompensation,
  listDeductionRules,
  upsertDeductionRule,
  deleteDeductionRule,
  getDeductionSuggestions,
  generateSalarySlip,
  getSalarySlip,
  updateSalarySlip,
  finalizeSalarySlip,
  generateSalarySlipPDF,
  getSalarySlipPDF
} from '../../controllers/subdomain/payroll.controller.js';

const router = express.Router();

router.use(validateSubdomain);
router.use(authenticateTenant);

// Compensation management
router.get('/compensation/:userId', getCompensation);
router.post('/compensation/:userId', requireHROrManager, upsertCompensation);

// Deduction rules
router.get('/deduction-rules', listDeductionRules);
router.post('/deduction-rules', requireHROrManager, upsertDeductionRule);
router.delete('/deduction-rules/:code', requireHROrManager, deleteDeductionRule);
router.get('/deduction-suggestions', getDeductionSuggestions);

// Salary slips
router.post('/slips/generate', requireHROrManager, generateSalarySlip);
router.get('/slips/:userId/:year/:month', getSalarySlip);
router.put('/slips/:userId/:year/:month', requireHROrManager, updateSalarySlip);
router.post('/slips/:userId/:year/:month/finalize', requireHROrManager, finalizeSalarySlip);

// Salary slip PDF
router.post('/slips/:userId/:year/:month/pdf', requireHROrManager, generateSalarySlipPDF);
router.get('/slips/:userId/:year/:month/pdf', getSalarySlipPDF);

export default router;