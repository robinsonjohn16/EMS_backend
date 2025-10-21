import express from 'express';
import { validateSubdomain } from '../../middleware/subdomain.middleware.js';
import { authenticateTenant, requireHROrManager } from '../../middleware/tenantAuth.middleware.js';
import { listUserAttendanceConfigs, getUserAttendanceConfig, upsertUserAttendanceConfig } from '../../controllers/tenant/userAttendanceConfig.controller.js';

const router = express.Router();

router.use(validateSubdomain);
router.use(authenticateTenant);

// HR/Manager endpoints
router.get('/', requireHROrManager, listUserAttendanceConfigs);
router.get('/:userId', requireHROrManager, getUserAttendanceConfig);
router.put('/:userId', requireHROrManager, upsertUserAttendanceConfig);

export default router;