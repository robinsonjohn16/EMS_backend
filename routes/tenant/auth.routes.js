import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const orgId = req.organization?._id?.toString() || 'unknown_org';
    const dest = path.join(process.cwd(), 'uploads', 'avatars', orgId);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
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

// Import controllers
import {
  registerTenantUser,
  loginTenantUser,
  refreshToken,
  logoutTenantUser,
  getTenantUserProfile,
  updateTenantUserProfile,
  changePassword
} from '../../controllers/tenant/auth.controller.js';

// Import middleware
import { validateSubdomain, extractOrganization } from '../../middleware/subdomain.middleware.js';
import { authenticateTenant } from '../../middleware/tenantAuth.middleware.js';
import { authenticateUser } from '../../middleware/auth.middleware.js'; // For super admin

// Public routes (with organization context)
router.post('/login', extractOrganization, loginTenantUser);
router.post('/refresh-token', refreshToken);

// Protected routes for super admin (to create tenant users)
router.post('/register', authenticateUser, registerTenantUser);

// Protected routes for tenant users (require subdomain validation)
router.use(validateSubdomain); // All routes below require valid subdomain

router.post('/logout', authenticateTenant, logoutTenantUser);
router.get('/profile', authenticateTenant, getTenantUserProfile);
router.put('/profile', authenticateTenant, upload.single('avatar'), updateTenantUserProfile);
router.put('/change-password', authenticateTenant, changePassword);

export default router;