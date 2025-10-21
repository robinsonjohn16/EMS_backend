import express from 'express';
import { validateSubdomain } from '../../middleware/subdomain.middleware.js';
import { authenticateTenant, requireHROrManager } from '../../middleware/tenantAuth.middleware.js';
import { checkIn, checkOut, getMonthlyAttendance, setAttendanceStatusForUser, bulkSetAttendanceStatus } from '../../controllers/subdomain/attendance.controller.js';

const router = express.Router();

router.use(validateSubdomain);
router.use(authenticateTenant);

router.post('/checkin', checkIn);
router.post('/checkout', checkOut);
router.get('/monthly', getMonthlyAttendance);

// HR/Manager admin endpoints for attendance overrides
router.post('/admin/set/:userId', requireHROrManager, setAttendanceStatusForUser);
router.post('/admin/bulk-set', requireHROrManager, bulkSetAttendanceStatus);

export default router;