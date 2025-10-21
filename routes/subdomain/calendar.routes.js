import express from 'express';
import { getCalendarData } from '../../controllers/subdomain/calendar.controller.js';
import { validateSubdomain } from '../../middleware/subdomain.middleware.js';
import { authenticateTenant } from '../../middleware/tenantAuth.middleware.js';

const router = express.Router();

router.use(validateSubdomain);
router.use(authenticateTenant);

// GET /api/v1/subdomain/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD&employeeId=... (optional for HR)
router.get('/', getCalendarData);

export default router;