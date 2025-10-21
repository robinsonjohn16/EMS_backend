import Leave from '../../models/tenant/leave.model.js';
import LeaveQuota from '../../models/tenant/leaveQuota.model.js';
import { successResponse } from '../../utils/apiResponse.js';
import { NotFoundError, BadRequestError } from '../../utils/errorClasses.js';
import MonthlyAttendance from '../../models/tenant/monthlyAttendance.model.js';
import AttendanceConfig from '../../models/tenant/attendanceConfig.model.js';
import TenantUser from '../../models/tenant/auth.model.js';
import Holiday from '../../models/tenant/holiday.model.js';

// Get all leaves for an employee
export const getEmployeeLeaves = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { status, year } = req.query;

    let query = { employeeId };

    // Filter by status if provided
    if (status) {
      query.status = status;
    }

    // Filter by year if provided
    if (year) {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31);
      query.$or = [
        { startDate: { $gte: startDate, $lte: endDate } },
        { endDate: { $gte: startDate, $lte: endDate } }
      ];
    }

    const leaves = await Leave.find(query).sort({ startDate: -1 });

    return successResponse(res, 200, 'Employee leaves retrieved', { leaves });
  } catch (error) {
    next(error);
  }
};

// Get all leaves for an organization (HR view)
export const getOrganizationLeaves = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const { status, employeeId, startDate, endDate } = req.query;

    let query = { organizationId };

    // Filter by status if provided
    if (status) {
      query.status = status;
    }

    // Filter by employee if provided
    if (employeeId) {
      query.employeeId = employeeId;
    }

    // Filter by date range if provided
    if (startDate && endDate) {
      query.$or = [
        { startDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
        { endDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
        {
          $and: [
            { startDate: { $lte: new Date(startDate) } },
            { endDate: { $gte: new Date(endDate) } }
          ]
        }
      ];
    }

    const leaves = await Leave.find(query)
      .populate('employeeId', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });
    return successResponse(res, 200, 'Organization leaves retrieved', { leaves });
  } catch (error) {
    next(error);
  }
};

// Apply for leave
export const applyLeave = async (req, res, next) => {
  try {
    const { employeeId, organizationId } = req.params;
    const {
      leaveType,
      startDate,
      endDate,
      isHalfDay,
      halfDayPeriod,
      reason,
      attachments,
      requestedDaysDetails
    } = req.body;

    if (!leaveType || !reason) {
      throw new BadRequestError('Leave type and reason are required');
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestError('Start date and end date are required');
    }

    if (start > end) {
      throw new BadRequestError('Start date cannot be after end date');
    }

    // Sanitize requestedDaysDetails if provided
    let sanitizedDetails = Array.isArray(requestedDaysDetails) ? requestedDaysDetails : [];
    sanitizedDetails = sanitizedDetails.map((d) => {
      const dateStr = String(d.date);
      const parsed = new Date(dateStr);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestError(`Invalid date in requestedDaysDetails: ${dateStr}`);
      }
      const isHalf = Boolean(d.isHalfDay);
      let period = d.halfDayPeriod ?? null;
      if (isHalf) {
        if (!['morning','afternoon'].includes(period)) {
          throw new BadRequestError(`Invalid halfDayPeriod for ${dateStr}, expected 'morning' or 'afternoon'`);
        }
      } else {
        period = null;
      }
      const dDate = new Date(dateStr);
      if (dDate < start || dDate > end) {
        throw new BadRequestError(`Requested date ${dateStr} must be within start and end date`);
      }
      return { date: dateStr, isHalfDay: isHalf, halfDayPeriod: period };
    });

    // Calculate number of days
    let leaveDays = 0;
    if (sanitizedDetails.length > 0) {
      const perDay = new Map();
      for (const d of sanitizedDetails) {
        const prev = perDay.get(d.date) ?? 0;
        const add = d.isHalfDay ? 0.5 : 1;
        const next = Math.min(1, prev + add);
        perDay.set(d.date, next);
      }
      leaveDays = Array.from(perDay.values()).reduce((a, b) => a + b, 0);
    } else {
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      leaveDays = diffDays;
      if (isHalfDay && start.getTime() === end.getTime()) {
        leaveDays = 0.5;
      }
    }

    // NEW: allow unpaid leave type without quota checks
    const isUnpaid = String(leaveType).toLowerCase() === 'unpaid';

    if (!isUnpaid) {
      // Check leave quota
      const currentYear = new Date().getFullYear();
      let leaveQuota = await LeaveQuota.findOne({
        employeeId,
        organizationId,
        year: currentYear
      });

      if (!leaveQuota) {
        throw new NotFoundError('Leave quota not found for the current year');
      }

      const leaveTypeQuota = leaveQuota.quotas.find(q => q.leaveType === leaveType);

      if (!leaveTypeQuota) {
        throw new NotFoundError(`Quota for ${leaveType} leave type not found`);
      }

      if (leaveTypeQuota.remaining < leaveDays) {
        throw new BadRequestError(`Insufficient ${leaveType} leave balance. Available: ${leaveTypeQuota.remaining} days`);
      }
    }

    // Create leave request
    const leave = new Leave({
      employeeId,
      organizationId,
      leaveType,
      startDate: start,
      endDate: end,
      isHalfDay: isHalfDay || false,
      halfDayPeriod: halfDayPeriod ?? null,
      reason,
      attachments: attachments || [],
      requestedDaysDetails: sanitizedDetails,
      status: 'pending'
    });

    await leave.save();

    if (!isUnpaid) {
      // Update pending quota
      const currentYear = new Date().getFullYear();
      const leaveQuota = await LeaveQuota.findOne({ employeeId, organizationId, year: currentYear });
      if (leaveQuota) {
        const leaveTypeQuota = leaveQuota.quotas.find(q => q.leaveType === leaveType);
        if (leaveTypeQuota) {
          leaveTypeQuota.pending += leaveDays;
          leaveTypeQuota.remaining = leaveTypeQuota.total - leaveTypeQuota.used - leaveTypeQuota.pending;
          await leaveQuota.save();
        }
      }
    }

    return successResponse(res, 201, 'Leave request submitted', { leave, leaveDays });
  } catch (error) {
    next(error);
  }
};

// Approve or reject leave
export const processLeaveRequest = async (req, res, next) => {
  try {
    const { leaveId } = req.params;
    const { status, rejectionReason, payStatus, deductQuota, approvedDays, approvedDaysDetails } = req.body;
    const approverUserId = req.user._id;

    if (!status || !['approved', 'rejected'].includes(status)) {
      throw new BadRequestError('Valid status (approved/rejected) is required');
    }

    if (status === 'rejected' && !rejectionReason) {
      throw new BadRequestError('Rejection reason is required');
    }

    // Validate payStatus when approving
    if (status === 'approved') {
      if (!['paid', 'unpaid'].includes(payStatus)) {
        throw new BadRequestError('payStatus must be either "paid" or "unpaid" when approving');
      }
    }

    const leave = await Leave.findById(leaveId);

    if (!leave) {
      throw new NotFoundError('Leave request not found');
    }

    if (leave.status !== 'pending') {
      throw new BadRequestError(`Leave request is already ${leave.status}`);
    }

    // Calculate requested days in the same way as applyLeave
    const start = new Date(leave.startDate);
    const end = new Date(leave.endDate);
    let requestedDaysNumber = 0;
    if (Array.isArray(leave.requestedDaysDetails) && leave.requestedDaysDetails.length > 0) {
      const perDay = new Map();
      for (const d of leave.requestedDaysDetails) {
        const add = d.isHalfDay ? 0.5 : 1;
        const prev = perDay.get(String(d.date)) ?? 0;
        perDay.set(String(d.date), Math.min(1, prev + add));
      }
      requestedDaysNumber = Array.from(perDay.values()).reduce((a, b) => a + b, 0);
    } else {
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      requestedDaysNumber = diffDays;
      if (leave.isHalfDay && start.getTime() === end.getTime()) {
        requestedDaysNumber = 0.5;
      }
    }

    // Build allowed date set from requestedDaysDetails (if provided)
    const allowedDatesSet = new Set(
      (leave.requestedDaysDetails || [])
        .map(d => toLocalYMD(new Date(d.date), leave.timezone || undefined))
    );

    // Determine approvedDays for partial approvals (with validation)
    let approvedDaysNumber = null;
    if (status === 'approved') {
      if (approvedDaysDetails && Array.isArray(approvedDaysDetails)) {
        // Load attendance config and holidays for non-working day validation
        const attendanceConfig = await AttendanceConfig.findOne({ organizationId: leave.organizationId });
        const timezone = attendanceConfig?.timezone || 'UTC';
        const holidays = await Holiday.find({ organizationId: leave.organizationId, isActive: true });
        const fixedHolidayYMD = new Set();
        const yearlyHolidayMD = new Set();
        for (const h of holidays) {
          const hYMD = toLocalYMD(new Date(h.date), timezone);
          if (h.recurrence === 'yearly') {
            yearlyHolidayMD.add(hYMD.slice(5)); // MM-DD
          } else {
            fixedHolidayYMD.add(hYMD);
          }
        }

        const startDate = new Date(leave.startDate);
        const endDate = new Date(leave.endDate);
        const approvedPerDay = new Map();

        for (const dayDetail of approvedDaysDetails) {
          if (!dayDetail.date || typeof dayDetail.date !== 'string') {
            throw new BadRequestError('Invalid date in approved days details');
          }
          const dayDate = new Date(dayDetail.date);
          if (Number.isNaN(dayDate.getTime())) {
            throw new BadRequestError(`Invalid approved date: ${dayDetail.date}`);
          }
          if (dayDate < startDate || dayDate > endDate) {
            throw new BadRequestError('Approved date is outside leave period');
          }

          const localYMD = toLocalYMD(dayDate, timezone);

          // If requestedDaysDetails exists, ensure the day is part of the requested set
          if (allowedDatesSet.size > 0 && !allowedDatesSet.has(localYMD)) {
            throw new BadRequestError(`Approved date ${localYMD} was not requested`);
          }

          // Validate half-day selection
          const isHalf = Boolean(dayDetail.isHalfDay);
          if (isHalf && !['morning','afternoon'].includes(dayDetail.halfDayPeriod)) {
            throw new BadRequestError(`Invalid halfDayPeriod for ${localYMD}, expected 'morning' or 'afternoon'`);
          }

          // Validate non-working day
          const weekdayNum = weekdayNumber(dayDate, timezone);
          const working = isWorkingDay(weekdayNum, attendanceConfig, dayDate);
          const isFixedHoliday = fixedHolidayYMD.has(localYMD);
          const isYearlyHoliday = yearlyHolidayMD.has(localYMD.slice(5));
          if (!working || isFixedHoliday || isYearlyHoliday) {
            throw new BadRequestError(`Cannot approve leave on non-working/holiday date: ${localYMD}`);
          }

          // Sum with cap of 1 per date
          const add = isHalf ? 0.5 : 1;
          const prev = approvedPerDay.get(localYMD) ?? 0;
          approvedPerDay.set(localYMD, Math.min(1, prev + add));
        }

        approvedDaysNumber = Array.from(approvedPerDay.values()).reduce((a, b) => a + b, 0);

        // Ensure approved days do not exceed requested
        if (approvedDaysNumber > requestedDaysNumber) {
          throw new BadRequestError('Approved days cannot exceed requested days');
        }
      } else if (leave.isHalfDay) {
        approvedDaysNumber = 0.5;
      } else {
        const requestedDays = requestedDaysNumber;
        if (approvedDays === undefined || approvedDays === null) {
          approvedDaysNumber = requestedDays;
        } else {
          const parsed = Number(approvedDays);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new BadRequestError('approvedDays must be a positive number');
          }
          if (parsed > requestedDays) {
            throw new BadRequestError('approvedDays cannot exceed requested days');
          }
          const halfStep = Math.round(parsed * 2) / 2;
          if (Math.abs(halfStep - parsed) > 1e-6) {
            throw new BadRequestError('approvedDays must be in 0.5 increments');
          }
          approvedDaysNumber = halfStep;
        }
      }
    }

    // Update leave request
    leave.status = status;
    leave.approvedBy = approverUserId;
    leave.approvedDays = status === 'approved' ? approvedDaysNumber : null;
    leave.approvalDate = new Date();
    leave.payStatus = status === 'approved' ? payStatus : null;

    if (status === 'approved' && approvedDaysDetails && Array.isArray(approvedDaysDetails)) {
      // Normalize dates to YMD in timezone for consistency
      const attendanceConfig = await AttendanceConfig.findOne({ organizationId: leave.organizationId });
      const timezone = attendanceConfig?.timezone || 'UTC';
      leave.approvedDaysDetails = approvedDaysDetails.map(d => ({
        date: toLocalYMD(new Date(String(d.date)), timezone),
        isHalfDay: Boolean(d.isHalfDay),
        halfDayPeriod: d.isHalfDay ? (d.halfDayPeriod ?? null) : null,
        approved: true,
      }));
    }

    if (status === 'rejected') {
      leave.rejectionReason = rejectionReason;
    }

    await leave.save();

    // Update leave quota using requestedDaysNumber to avoid negative pending
    const currentYear = new Date().getFullYear();
    const leaveQuota = await LeaveQuota.findOne({
      employeeId: leave.employeeId,
      organizationId: leave.organizationId,
      year: currentYear
    });

    if (leaveQuota) {
      const leaveTypeQuota = leaveQuota.quotas.find(q => q.leaveType === leave.leaveType);

      if (leaveTypeQuota) {
        // Reduce pending for the full requested amount
        leaveTypeQuota.pending = Math.max(0, leaveTypeQuota.pending - requestedDaysNumber);

        // Determine whether to deduct from quota
        const shouldDeduct = (deductQuota !== undefined) ? !!deductQuota : (payStatus === 'paid');

        // If approved and should deduct, increase used days
        if (status === 'approved' && shouldDeduct) {
          leaveTypeQuota.used += (approvedDaysNumber ?? requestedDaysNumber);
        }

        // Clamp used not below 0
        if (leaveTypeQuota.used < 0) leaveTypeQuota.used = 0;

        // Recalculate remaining
        leaveTypeQuota.remaining = leaveTypeQuota.total - leaveTypeQuota.used - leaveTypeQuota.pending;

        await leaveQuota.save();
      }
    }

    if (status === 'approved' && approvedDaysNumber) {
      await markApprovedLeaveDays(leave, approvedDaysNumber, req.user._id);
    }

    return successResponse(res, 200, 'Leave request processed', { leave });
  } catch (error) {
    next(error);
  }
};

// Cancel leave
export const cancelLeave = async (req, res, next) => {
  try {
    const { leaveId } = req.params;
    const initiatorUserId = req.user._id;

    const leave = await Leave.findById(leaveId);

    if (!leave) {
      throw new NotFoundError('Leave request not found');
    }

    const isOwner = leave.employeeId.toString() === initiatorUserId.toString();
    const isHROrManager = ['hr','manager'].includes(req.user.role);
    if (!isOwner && !isHROrManager) {
      throw new BadRequestError('You are not authorized to cancel this leave');
    }

    if (leave.status !== 'pending' && leave.status !== 'approved') {
      throw new BadRequestError(`Cannot cancel leave in ${leave.status} status`);
    }

    // Calculate requested days in the same way as applyLeave
    const start = new Date(leave.startDate);
    const end = new Date(leave.endDate);
    let requestedDaysNumber = 0;
    if (Array.isArray(leave.requestedDaysDetails) && leave.requestedDaysDetails.length > 0) {
      const perDay = new Map();
      for (const d of leave.requestedDaysDetails) {
        const add = d.isHalfDay ? 0.5 : 1;
        const prev = perDay.get(String(d.date)) ?? 0;
        perDay.set(String(d.date), Math.min(1, prev + add));
      }
      requestedDaysNumber = Array.from(perDay.values()).reduce((a, b) => a + b, 0);
    } else {
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      requestedDaysNumber = diffDays;
      if (leave.isHalfDay && start.getTime() === end.getTime()) {
        requestedDaysNumber = 0.5;
      }
    }

    // Keep previous status for quota adjustments
    const previousStatus = leave.status;

    // Update leave status
    leave.status = 'cancelled';
    await leave.save();

    // Update leave quota
    const currentYear = new Date().getFullYear();
    const leaveQuota = await LeaveQuota.findOne({
      employeeId: leave.employeeId,
      organizationId: leave.organizationId,
      year: currentYear
    });

    if (leaveQuota) {
      const leaveTypeQuota = leaveQuota.quotas.find(q => q.leaveType === leave.leaveType);

      if (leaveTypeQuota) {
        if (previousStatus === 'pending') {
          // If pending, reduce pending days
          leaveTypeQuota.pending = Math.max(0, leaveTypeQuota.pending - requestedDaysNumber);
        } else if (previousStatus === 'approved') {
          // If approved, reduce used days based on approvedDays
          const decrease = leave.approvedDays ?? requestedDaysNumber;
          leaveTypeQuota.used = Math.max(0, leaveTypeQuota.used - decrease);
        }

        // Recalculate remaining
        leaveTypeQuota.remaining = leaveTypeQuota.total - leaveTypeQuota.used - leaveTypeQuota.pending;

        await leaveQuota.save();
      }
    }

    return successResponse(res, 200, 'Leave cancelled successfully');
  } catch (error) {
    next(error);
  }
};

// Get leave quota for an employee
export const getLeaveQuota = async (req, res, next) => {
  try {
    const { employeeId, organizationId } = req.params;
    const { year } = req.query;

    const currentYear = year || new Date().getFullYear();

    let leaveQuota = await LeaveQuota.findOne({
      employeeId,
      organizationId,
      year: currentYear
    });

    if (!leaveQuota) {
      // Create default quota if not exists
      leaveQuota = new LeaveQuota({
        employeeId,
        organizationId,
        year: currentYear,
        quotas: [
          { leaveType: 'sick', total: 10, used: 0, pending: 0, remaining: 10 },
          { leaveType: 'paid', total: 10, used: 0, pending: 0, remaining: 10 },
          { leaveType: 'casual', total: 10, used: 0, pending: 0, remaining: 10 },
          { leaveType: 'annual', total: 15, used: 0, pending: 0, remaining: 15 }
        ]
      });

      await leaveQuota.save();
    }

    return successResponse(res, 200, 'Leave quota retrieved', { leaveQuota });
  } catch (error) {
    next(error);
  }
};

// Update leave quota for an employee
export const updateLeaveQuota = async (req, res, next) => {
  try {
    const { employeeId, organizationId } = req.params;
    const { year, quotas } = req.body;

    if (!quotas || !Array.isArray(quotas)) {
      throw new BadRequestError('Valid quotas array is required');
    }

    const currentYear = year || new Date().getFullYear();

    let leaveQuota = await LeaveQuota.findOne({
      employeeId,
      organizationId,
      year: currentYear
    });

    if (!leaveQuota) {
      leaveQuota = new LeaveQuota({
        employeeId,
        organizationId,
        year: currentYear,
        quotas: []
      });
    }

    // Update quotas
    quotas.forEach(quota => {
      const existingQuotaIndex = leaveQuota.quotas.findIndex(q => q.leaveType === quota.leaveType);

      if (existingQuotaIndex !== -1) {
        // Update existing quota
        leaveQuota.quotas[existingQuotaIndex].total = quota.total;
        leaveQuota.quotas[existingQuotaIndex].remaining = 
          quota.total - leaveQuota.quotas[existingQuotaIndex].used - leaveQuota.quotas[existingQuotaIndex].pending;
      } else {
        // Add new quota
        leaveQuota.quotas.push({
          leaveType: quota.leaveType,
          total: quota.total,
          used: 0,
          pending: 0,
          remaining: quota.total
        });
      }
    });

    await leaveQuota.save();

    return successResponse(res, 200, 'Leave quota updated', { leaveQuota });
  } catch (error) {
    next(error);
  }
};

// Helper functions and monthly attendance update for approved leaves (module scope)
const toLocalYMD = (date, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);
const weekdayNumber = (date, tz) => {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[w] ?? 0;
};
const isWorkingDay = (weekdayNum, config, date) => {
  if (!config) return true;
  const wd = config.workingDays || {};
  const baseWorking = [wd.sunday, wd.monday, wd.tuesday, wd.wednesday, wd.thursday, wd.friday, wd.saturday][weekdayNum] ?? true;
  const names = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const rules = config.weekdayRules || {};
  const dayRuleObj = rules[names[weekdayNum]] || {};
  const dayRule = dayRuleObj.rule || (names[weekdayNum] === 'saturday' ? config.saturdayRule : 'all');
  if (dayRule === 'none') return false;
  if (dayRule === 'all' || !dayRule) return baseWorking;
  const dayOfMonth = Number(new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, day: 'numeric' }).format(date));
  const isOdd = dayOfMonth % 2 === 1;
  return baseWorking && ((dayRule === 'odd' && isOdd) || (dayRule === 'even' && !isOdd));
};

export const markApprovedLeaveDays = async (leave, approvedDaysNumber, actorUserId) => {
  try {
    const config = await AttendanceConfig.findOne({ organizationId: leave.organizationId });
    const timezone = config?.timezone || 'UTC';

    const userId = leave.employeeId;
    if (!userId) return;

    // If we have specific approved days details, use those
    if (leave.approvedDaysDetails && Array.isArray(leave.approvedDaysDetails)) {
      for (const dayDetail of leave.approvedDaysDetails) {
        const dayDate = new Date(dayDetail.date);
        const localDate = toLocalYMD(dayDate, timezone);
        const weekday = weekdayNumber(dayDate, timezone);
        const workingDay = isWorkingDay(weekday, config, dayDate);
        const year = Number(localDate.slice(0, 4));
        const month = Number(localDate.slice(5, 7));

        // Only mark working days
        if (workingDay) {
          const isHalf = dayDetail.isHalfDay;
          const halfPeriod = dayDetail.halfDayPeriod;
          let noteSuffix = '';
          if (isHalf && halfPeriod) {
            noteSuffix = ` (Half-day - ${halfPeriod})`;
          } else if (isHalf) {
            noteSuffix = ' (Half-day)';
          }

          const dayRecord = {
            date: localDate,
            weekday,
            workingDay,
            notes: `Leave (${leave.leaveType}) - Approved${noteSuffix}`,
          };

          await MonthlyAttendance.findOneAndUpdate(
            { organizationId: leave.organizationId, userId, year, month },
            {
              $set: {
                timezone,
                [`days.${localDate}.date`]: dayRecord.date,
                [`days.${localDate}.weekday`]: dayRecord.weekday,
                [`days.${localDate}.workingDay`]: dayRecord.workingDay,
                [`days.${localDate}.isLeaveApproved`]: true,
                [`days.${localDate}.isHalfDay`]: isHalf,
                [`days.${localDate}.notes`]: dayRecord.notes,
              },
              $setOnInsert: { createdBy: actorUserId },
              $currentDate: { updatedAt: true }
            },
            { upsert: true, new: true }
          );
        }
      }
    } else {
      // Fallback to original logic for backward compatibility
      const startDate = new Date(leave.startDate);
      let remaining = approvedDaysNumber;
      let idx = 0;
      while (remaining > 1e-6) {
        const current = new Date(startDate);
        current.setDate(startDate.getDate() + idx);
        const localDate = toLocalYMD(current, timezone);
        const weekday = weekdayNumber(current, timezone);
        const workingDay = isWorkingDay(weekday, config, current);
        const year = Number(localDate.slice(0, 4));
        const month = Number(localDate.slice(5, 7));

        // Only mark working days
        if (workingDay) {
          const isHalf = remaining < 1 ? true : false;
          const noteSuffix = isHalf ? ' (Half-day)' : '';
          const dayRecord = {
            date: localDate,
            weekday,
            workingDay,
            notes: `Leave (${leave.leaveType}) - Approved${noteSuffix}`,
          };

          await MonthlyAttendance.findOneAndUpdate(
            { organizationId: leave.organizationId, userId, year, month },
            {
              $set: {
                timezone,
                [`days.${localDate}.date`]: dayRecord.date,
                [`days.${localDate}.weekday`]: dayRecord.weekday,
                [`days.${localDate}.workingDay`]: dayRecord.workingDay,
                [`days.${localDate}.isLeaveApproved`]: true,
                [`days.${localDate}.isHalfDay`]: isHalf,
                [`days.${localDate}.notes`]: dayRecord.notes,
              },
              $setOnInsert: { createdBy: actorUserId },
              $currentDate: { updatedAt: true }
            },
            { upsert: true, new: true }
          );

          remaining -= isHalf ? 0.5 : 1;
        }

        idx += 1;
      }
    }
  } catch (e) {
    // Swallow monthly attendance errors to not block approvals
    console.error('Failed to mark approved leave days:', e?.message || e);
  }
};