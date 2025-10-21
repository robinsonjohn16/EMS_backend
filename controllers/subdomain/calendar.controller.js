import AttendanceConfig from '../../models/tenant/attendanceConfig.model.js';
import Holiday from '../../models/tenant/holiday.model.js';
import Leave from '../../models/tenant/leave.model.js';
import LeaveQuota from '../../models/tenant/leaveQuota.model.js';
import Employee from '../../models/tenant/employee.model.js';
import { successResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/errorClasses.js';
import UserAttendanceConfig from '../../models/tenant/userAttendanceConfig.model.js';

// Merge organization policy with user override; user wins where provided
const mergeLeavePolicy = (org = {}, user = {}) => {
  const base = {
    sick: {
      perYearDays: Number(org?.sick?.perYearDays || 0),
      carryForward: !!org?.sick?.carryForward,
    },
    paid: {
      perYearDays: Number(org?.paid?.perYearDays || 0),
      carryForward: !!org?.paid?.carryForward,
    },
    customTypes: Array.isArray(org?.customTypes)
      ? org.customTypes.map((ct) => ({
          code: String(ct?.code || '').toLowerCase().trim(),
          label: ct?.label || '',
          perYearDays: Number(ct?.perYearDays || 0),
          carryForward: !!ct?.carryForward,
        }))
      : [],
  };

  // Override sick/paid if user provided
  if (user?.sick) {
    base.sick = {
      perYearDays: Number(user.sick.perYearDays || 0),
      carryForward: !!user.sick.carryForward,
    };
  }
  if (user?.paid) {
    base.paid = {
      perYearDays: Number(user.paid.perYearDays || 0),
      carryForward: !!user.paid.carryForward,
    };
  }

  // Merge custom types by code (user overrides existing or adds new)
  const map = new Map(base.customTypes.map((t) => [String(t.code).toLowerCase(), t]));
  if (Array.isArray(user?.customTypes)) {
    for (const t of user.customTypes) {
      const code = String(t?.code || '').toLowerCase().trim();
      if (!code) continue;
      map.set(code, {
        code,
        label: t?.label || map.get(code)?.label || code,
        perYearDays: Number(t?.perYearDays || 0),
        carryForward: !!t?.carryForward,
      });
    }
  }
  base.customTypes = Array.from(map.values());
  return base;
};

const parseDate = (value, fallback) => {
  if (!value) return fallback;
  const d = new Date(value);
  return isNaN(d.getTime()) ? fallback : d;
};

const isOverlap = (rangeStart, rangeEnd, start, end) => {
  return (
    (start >= rangeStart && start <= rangeEnd) ||
    (end >= rangeStart && end <= rangeEnd) ||
    (start <= rangeStart && end >= rangeEnd)
  );
};

const countLeaveDays = (start, end, isHalfDay) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const oneDay = 1000 * 60 * 60 * 24;
  const diff = Math.floor((endDate - startDate) / oneDay) + 1;
  if (isHalfDay && startDate.toDateString() === endDate.toDateString()) return 0.5;
  return diff;
};

export const getCalendarData = async (req, res, next) => {
  try {
    const organizationId = req.user?.organization?._id;
    if (!organizationId) {
      throw new ApiError('Organization context missing', 400);
    }

    const startDefault = new Date();
    startDefault.setDate(1);
    startDefault.setHours(0,0,0,0);
    const endDefault = new Date(startDefault);
    endDefault.setMonth(endDefault.getMonth() + 1);
    endDefault.setDate(0);
    endDefault.setHours(23,59,59,999);

    const start = parseDate(req.query.start, startDefault);
    const end = parseDate(req.query.end, endDefault);
    const currentYear = start.getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999);

    // Resolve employeeId: allow HR/Manager to pass employeeId, otherwise use current user
    let employeeId = req.query.employeeId;
    const isHROrManager = ['hr', 'manager'].includes(req.user?.role);
    let employeeDoc = null;
    if (!employeeId) {
      const employee = await Employee.findOne({ organizationId, userId: req.user._id });
      if (!employee) {
        throw new ApiError('Employee profile not found', 404);
      }
      employeeId = employee._id;
      employeeDoc = employee;
    } else if (!isHROrManager) {
      // Non-HR cannot query other employees
      const employee = await Employee.findOne({ organizationId, userId: req.user._id });
      employeeId = employee?._id;
      employeeDoc = employee;
    } else {
      employeeDoc = await Employee.findById(employeeId).lean();
      if (!employeeDoc || String(employeeDoc.organizationId) !== String(organizationId)) {
        throw new ApiError('Employee not found in this organization', 404);
      }
    }

    // Attendance config
    const attendance = await AttendanceConfig.findOne({ organizationId });
    const workingSettings = attendance ? {
      workingDays: attendance.workingDays,
      weekdayRules: attendance.weekdayRules,
      saturdayRule: attendance.saturdayRule,
      startTime: attendance.startTime,
      endTime: attendance.endTime,
      breakMinutes: attendance.breakMinutes,
      timezone: attendance.timezone
    } : {
      workingDays: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false },
      weekdayRules: { monday: { rule: 'all' }, tuesday: { rule: 'all' }, wednesday: { rule: 'all' }, thursday: { rule: 'all' }, friday: { rule: 'all' }, saturday: { rule: 'none' }, sunday: { rule: 'none' } },
      saturdayRule: 'none',
      startTime: '09:30',
      endTime: '18:00',
      breakMinutes: 60,
      timezone: 'UTC'
    };

    // Resolve effective leave policy: user override merges with org policy
    const orgPolicy = attendance?.leavePolicy || { sick: { perYearDays: 0, carryForward: false }, paid: { perYearDays: 0, carryForward: false }, customTypes: [] };
    let effectivePolicy = orgPolicy;
    if (employeeDoc?.userId) {
      const userOverride = await UserAttendanceConfig.findOne({ organizationId, userId: employeeDoc.userId })
        .select('leavePolicy')
        .lean();
      if (userOverride?.leavePolicy) {
        effectivePolicy = mergeLeavePolicy(orgPolicy, userOverride.leavePolicy);
      }
    }

    // Holidays within range (consider yearly recurrence)
    const holidays = await Holiday.find({ organizationId, isActive: true }).lean();
    const holidayEvents = [];
    for (const h of holidays) {
      const originalDate = new Date(h.date);
      let occurrence = new Date(originalDate);
      if (h.recurrence === 'yearly') {
        occurrence.setFullYear(currentYear);
      }
      // include if occurrence within range
      if (isOverlap(start, end, occurrence, occurrence)) {
        holidayEvents.push({
          id: h._id.toString(),
          title: `Holiday: ${h.name}`,
          date: occurrence.toISOString(),
          type: 'holiday'
        });
      }
    }

    // Leaves overlapping view range (for calendar events)
    const leaves = await Leave.find({
      organizationId,
      employeeId,
      $or: [
        { startDate: { $gte: start, $lte: end } },
        { endDate: { $gte: start, $lte: end } },
        { $and: [ { startDate: { $lte: start } }, { endDate: { $gte: end } } ] }
      ]
    }).lean();

    const leaveEvents = [];
    
    for (const l of leaves) {
      // If we have specific approved days details, create individual events for each approved day
      if (l.approvedDaysDetails && Array.isArray(l.approvedDaysDetails) && l.status === 'approved') {
        for (const dayDetail of l.approvedDaysDetails) {
          if (dayDetail.approved) {
            const dayDate = new Date(dayDetail.date);
            let title = `${l.leaveType.charAt(0).toUpperCase() + l.leaveType.slice(1)} Leave (${l.status})`;
            
            if (dayDetail.isHalfDay) {
              title += ` - Half Day (${dayDetail.halfDayPeriod || 'N/A'})`;
            }
            
            leaveEvents.push({
              id: `${l._id.toString()}-${dayDetail.date}`,
              title,
              start: dayDate.toISOString(),
              end: dayDate.toISOString(),
              allDay: true,
              isHalfDay: !!dayDetail.isHalfDay,
              halfDayPeriod: dayDetail.halfDayPeriod || null,
              approvedDays: dayDetail.isHalfDay ? 0.5 : 1,
              payStatus: l.payStatus || null,
              status: l.status,
              type: 'leave',
              leaveId: l._id.toString(),
              specificDay: true
            });
          }
        }
      } else {
        // Fallback to original event format for leaves without specific day details
        leaveEvents.push({
          id: l._id.toString(),
          title: `${l.leaveType.charAt(0).toUpperCase() + l.leaveType.slice(1)} Leave (${l.status})`,
          start: new Date(l.startDate).toISOString(),
          end: new Date(l.endDate).toISOString(),
          allDay: true,
          isHalfDay: !!l.isHalfDay,
          halfDayPeriod: l.halfDayPeriod || null,
          approvedDays: typeof l.approvedDays === 'number' ? l.approvedDays : null,
          payStatus: l.payStatus || null,
          status: l.status,
          type: 'leave',
          leaveId: l._id.toString(),
          specificDay: false
        });
      }
    }

    // Build quotas strictly from effective policy (ignore stale or unrelated types)
    const quotas = [];
    if (effectivePolicy?.sick) {
      const total = Number(effectivePolicy.sick.perYearDays || 0);
      quotas.push({ leaveType: 'sick', total, used: 0, pending: 0, remaining: total });
    }
    if (effectivePolicy?.paid) {
      const total = Number(effectivePolicy.paid.perYearDays || 0);
      quotas.push({ leaveType: 'paid', total, used: 0, pending: 0, remaining: total });
    }
    if (Array.isArray(effectivePolicy?.customTypes)) {
      for (const t of effectivePolicy.customTypes) {
        const code = String(t?.code || '').toLowerCase().trim();
        if (!code) continue;
        const total = Number(t?.perYearDays || 0);
        quotas.push({ leaveType: code, total, used: 0, pending: 0, remaining: total });
      }
    }

    const quotasMap = new Map(quotas.map(q => [q.leaveType, { ...q }]));

    // Compute usage across the full year
    const yearLeaves = await Leave.find({
      organizationId,
      employeeId,
      $or: [
        { startDate: { $gte: yearStart, $lte: yearEnd } },
        { endDate: { $gte: yearStart, $lte: yearEnd } },
        { $and: [ { startDate: { $lte: yearStart } }, { endDate: { $gte: yearEnd } } ] }
      ]
    }).lean();

    for (const l of yearLeaves) {
      const lStart = new Date(l.startDate);
      const lEnd = new Date(l.endDate);
      const startClamped = lStart < yearStart ? yearStart : lStart;
      const endClamped = lEnd > yearEnd ? yearEnd : lEnd;
      const days = countLeaveDays(startClamped, endClamped, l.isHalfDay);
      const q = quotasMap.get(l.leaveType);
      // Only count if the leave type exists in the effective policy
      if (!q) continue;
      if (l.status === 'approved') {
        const approved = typeof l.approvedDays === 'number' ? Number(l.approvedDays) : days;
        q.used += approved;
      } else if (l.status === 'pending') {
        q.pending += days;
      }
      q.remaining = Math.max(0, (q.total || 0) - (q.used || 0) - (q.pending || 0));
      quotasMap.set(l.leaveType, q);
    }

    const quotaSummary = { year: currentYear, quotas: Array.from(quotasMap.values()) };

    return successResponse(res, 200, 'Calendar data fetched successfully', {
      workingSettings,
      events: {
        holidays: holidayEvents,
        leaves: leaveEvents
      },
      quota: quotaSummary,
      meta: {
        employeeId: employeeId.toString(),
        organizationId: organizationId.toString(),
        timezone: workingSettings.timezone,
        effectiveLeavePolicy: effectivePolicy,
      }
    });
  } catch (error) {
    next(error);
  }
};