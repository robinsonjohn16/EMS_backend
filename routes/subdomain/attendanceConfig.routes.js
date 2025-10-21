import express from 'express';
import { validateSubdomain } from '../../middleware/subdomain.middleware.js';
import { authenticateTenant, requireHROrManager } from '../../middleware/tenantAuth.middleware.js';
import { getAttendanceConfig, upsertAttendanceConfig } from '../../controllers/tenant/attendanceConfig.controller.js';

const router = express.Router();

router.use(validateSubdomain);
router.use(authenticateTenant);

// Get current organization's attendance config
router.get('/', getAttendanceConfig);

// Update/create attendance config (HR or Manager only)
router.put('/', requireHROrManager, upsertAttendanceConfig);

export default router;