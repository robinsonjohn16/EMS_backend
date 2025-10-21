import express from 'express';
import { validateSubdomain } from '../../middleware/subdomain.middleware.js';
import { authenticateTenant, requireHROrManager } from '../../middleware/tenantAuth.middleware.js';
import { listHolidays, createHoliday, updateHoliday, deleteHoliday } from '../../controllers/tenant/holiday.controller.js';

const router = express.Router();

router.use(validateSubdomain);
router.use(authenticateTenant);

// List holidays, optional ?year=YYYY to compute occurrenceDate
router.get('/', listHolidays);

// Create holiday (HR/Manager only)
router.post('/', requireHROrManager, createHoliday);

// Update holiday (HR/Manager only)
router.put('/:holidayId', requireHROrManager, updateHoliday);

// Delete holiday (HR/Manager only)
router.delete('/:holidayId', requireHROrManager, deleteHoliday);

export default router;