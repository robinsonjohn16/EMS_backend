import express from 'express';
import { 
  createOrganization, 
  getOrganizations, 
  getOrganization, 
  updateOrganization, 
  deleteOrganization,
  getOrganizationBySubdomain,
  updateOrganizationSettings,
  updateOrganizationLogo,
  getOrganizationStats
} from '../controllers/organization.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authenticateTenant, requireManager, requireHROrManager } from '../middleware/tenantAuth.middleware.js';
import multer from 'multer';
import path from 'path';
import { 
  validateOrganizationCreate, 
  validateOrganizationUpdate 
} from '../middleware/validation.middleware.js';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for organization logo uploads
const logoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const orgId = req.organization?._id?.toString() || 'unknown_org';
    const dest = path.join(process.cwd(), 'uploads', 'organization-logos', orgId);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const logoUpload = multer({
  storage: logoStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

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

// Tenant-specific routes
// @route   GET /api/tenant/organization/:subdomain
// @desc    Get organization by subdomain
// @access  Private (Tenant Users)
router.get('/tenant/:subdomain', authenticateTenant, getOrganizationBySubdomain);

// @route   PUT /api/tenant/organization/:organizationId/settings
// @desc    Update organization settings
// @access  Private (Manager only)
router.put('/tenant/:organizationId/settings', authenticateTenant, requireManager, updateOrganizationSettings);

// @route   PUT /api/tenant/organization/:organizationId/logo
// @desc    Update organization logo
// @access  Private (Manager only)
router.put('/tenant/:organizationId/logo', authenticateTenant, requireManager, logoUpload.single('logo'), updateOrganizationLogo);

// @route   GET /api/tenant/organization/:organizationId/stats
// @desc    Get organization statistics
// @access  Private (Manager/HR only)
router.get('/tenant/:organizationId/stats', authenticateTenant, requireHROrManager, getOrganizationStats);

export default router;