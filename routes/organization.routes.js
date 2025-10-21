import express from 'express';
import { 
  createOrganization, 
  getOrganizations, 
  getOrganization, 
  updateOrganization, 
  deleteOrganization 
} from '../controllers/organization.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { 
  validateOrganizationCreate, 
  validateOrganizationUpdate 
} from '../middleware/validation.middleware.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);

router
  .route('/')
  .post(validateOrganizationCreate, createOrganization)
  .get(getOrganizations);

router
  .route('/:id')
  .get(getOrganization)
  .put(validateOrganizationUpdate, updateOrganization)
  .delete(deleteOrganization);

export default router;