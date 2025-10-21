import express from 'express';
import { 
  createFieldCategory,
  getFieldCategories,
  getFieldCategory,
  updateFieldCategory,
  deleteFieldCategory,
  addField,
  updateField,
  deleteField,
  reorderFields
} from '../../controllers/tenant/employeeField.controller.js';
import { authenticateTenant, requireHROrManager } from '../../middleware/tenantAuth.middleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateTenant);

// Field category routes (HR/Manager only)
router.route('/')
  .post(requireHROrManager, createFieldCategory)
  .get(getFieldCategories);

router.route('/:categoryId')
  .get(getFieldCategory)
  .put(requireHROrManager, updateFieldCategory)
  .delete(requireHROrManager, deleteFieldCategory);

// Field routes (HR/Manager only)
router.route('/:categoryId/fields')
  .post(requireHROrManager, addField);

router.route('/:categoryId/fields/:fieldId')
  .put(requireHROrManager, updateField)
  .delete(requireHROrManager, deleteField);

router.route('/:categoryId/reorder')
  .post(requireHROrManager, reorderFields);

export default router;