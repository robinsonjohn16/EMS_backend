import AttendanceConfig from '../../models/tenant/attendanceConfig.model.js';
import UserAttendanceConfig from '../../models/tenant/userAttendanceConfig.model.js';
import MonthlyAttendance from '../../models/tenant/monthlyAttendance.model.js';
import Holiday from '../../models/tenant/holiday.model.js';
import Leave from '../../models/tenant/leave.model.js';
import Employee from '../../models/tenant/employee.model.js';
import { successResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/errorClasses.js';

// Helpers
const weekdayMap = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6
};

const toLocalYMD = (date, tz = 'UTC') => {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(date); // YYYY-MM-DD
};

const localParts = (date, tz = 'UTC') => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
};

const localWeekdayStr = (date, tz = 'UTC') => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(date).toLowerCase();
const localWeekdayNum = (date, tz = 'UTC') => {
  const wd = localWeekdayStr(date, tz);
  return weekdayMap[wd];
};

const occurrenceIndexInMonth = (date, tz = 'UTC') => {
  const { year, month, day } = localParts(date, tz);
  const currentDow = localWeekdayNum(date, tz);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const firstDow = localWeekdayNum(firstOfMonth, tz);
  const offset = (currentDow - firstDow + 7) % 7; // days from day 1 to first occurrence of this weekday
  const firstOccurrenceDate = 1 + offset;
  const occurrenceIndex = Math.floor((day - firstOccurrenceDate) / 7) + 1; // 1-based
  return occurrenceIndex;
};

const parseHHmmToMinutes = (hhmm = '09:30') => {
  const [hh, mm] = String(hhmm).split(':').map(Number);
  return hh * 60 + mm;
};

const minutesOfDayLocal = (date, tz = 'UTC') => {
  const local = new Date(date);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(local);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const hh = Number(map.hour);
  const mm = Number(map.minute);
  return hh * 60 + mm;
};

const haversineDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000; // m
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const computeWorkingDay = (date, config) => {
  const tz = config?.timezone || 'UTC';
  const rules = config?.weekdayRules || {};
  const wd = config?.workingDays || {};
  const satRule = config?.saturdayRule || 'none';
  const weekdayStr = localWeekdayStr(date, tz);
  const rule = rules?.[weekdayStr]?.rule ?? (weekdayStr === 'saturday' ? satRule : (wd[weekdayStr] === false ? 'none' : 'all'));
  let isWorking = rule !== 'none' && (wd?.[weekdayStr] !== false);
  if (rule === 'odd' || rule === 'even') {
    const idx = occurrenceIndexInMonth(date, tz);
    const isOdd = idx % 2 === 1;
    isWorking = rule === 'odd' ? isOdd : !isOdd;
  }
  if (rule === 'all') {
    isWorking = true;
  }
  return { isWorking, rule, weekdayStr, weekdayNum: weekdayMap[weekdayStr] };
};

const findHolidayForDate = async (organizationId, date, tz = 'UTC') => {
  const { year, month, day } = localParts(date, tz);
  const startOfDayUTC = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const endOfDayUTC = new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
  // Match direct date or yearly recurrence (month/day)
  const holiday = await Holiday.findOne({ organizationId, isActive: true, $or: [
    { date: { $gte: startOfDayUTC, $lte: endOfDayUTC }, recurrence: 'none' },
    { recurrence: 'yearly', $expr: { $and: [
      { $eq: [{ $dayOfMonth: '$date' }, day] },
      { $eq: [{ $month: '$date' }, month] }
    ] } }
  ] }).lean();
  return holiday;
};

const resolveGeofence = async (organizationId, userId) => {
  const orgCfg = await AttendanceConfig.findOne({ organizationId }).lean();
  const userCfg = await UserAttendanceConfig.findOne({ organizationId, userId }).lean();
  const tz = orgCfg?.timezone || 'UTC';

  // Determine active geofence
  let active = null;
  if (userCfg?.geofencing?.enabled) {
    active = {
      radiusMeters: userCfg.geofencing.radiusMeters || 100,
      locations: userCfg.geofencing.locations || [],
      required: true
    };
  } else if (orgCfg?.geofencing?.enabled) {
    const scope = orgCfg.geofencing.scope || 'organization';
    const applies = scope === 'organization' || (scope === 'user-specific' && Array.isArray(orgCfg.geofencing.userIds) && orgCfg.geofencing.userIds.some(id => String(id) === String(userId)));
    if (applies) {
      active = {
        radiusMeters: orgCfg.geofencing.radiusMeters || 100,
        locations: orgCfg.geofencing.locations || [],
        required: true
      };
    }
  }

  return { tz, orgCfg, userCfg, geofence: active };
};

export const checkIn = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const userId = req.user?._id;
    if (!organizationId || !userId) throw new ApiError('Organization or user context missing', 400);

    const { timestamp, location, source = 'web' } = req.body || {};
    const eventTime = timestamp ? new Date(timestamp) : new Date();

    const { tz, orgCfg, userCfg, geofence } = await resolveGeofence(organizationId, userId);

    const dateKey = toLocalYMD(eventTime, tz);
    const { year, month } = localParts(eventTime, tz);
    const weekdayNum = localWeekdayNum(eventTime, tz);

    // Working day computation
    const wdCheck = computeWorkingDay(eventTime, orgCfg);

    // Holiday check
    const holiday = await findHolidayForDate(organizationId, eventTime, tz);
    const isHoliday = !!holiday;

    // Leave check - prevent check-in on approved leave days
    const employee = await Employee.findOne({ userId, organizationId });
    if (employee) {
      const approvedLeave = await Leave.findOne({
        employeeId: employee._id,
        organizationId,
        status: 'approved',
        $or: [
          // Check if the date is in approvedDaysDetails array
          {
            approvedDaysDetails: {
              $elemMatch: {
                date: dateKey,
                approved: true
              }
            }
          },
          // Fallback: check if date is within leave period (for backward compatibility)
          {
            approvedDaysDetails: { $exists: false },
            startDate: { $lte: eventTime },
            endDate: { $gte: eventTime }
          }
        ]
      });

      if (approvedLeave) {
        // Check if it's a specific approved day
        const approvedDay = approvedLeave.approvedDaysDetails?.find(
          day => day.date === dateKey && day.approved
        );
        
        if (approvedDay) {
          if (approvedDay.isHalfDay) {
            // For half-day leaves, allow check-in only during the working period
            const currentHour = eventTime.getHours();
            const morningCutoff = 12; // 12 PM
            
            if (approvedDay.halfDayPeriod === 'morning' && currentHour < morningCutoff) {
              throw new ApiError('You are on approved morning leave and cannot check in', 400);
            } else if (approvedDay.halfDayPeriod === 'afternoon' && currentHour >= morningCutoff) {
              throw new ApiError('You are on approved afternoon leave and cannot check in', 400);
            }
          } else {
            // Full day leave - block check-in completely
            throw new ApiError('You are on approved leave and cannot check in', 400);
          }
        } else if (!approvedLeave.approvedDaysDetails) {
          // Fallback for old leave records without specific day details
          throw new ApiError('You are on approved leave and cannot check in', 400);
        }
      }
    }

    // Grace period check
    const startMinutes = parseHHmmToMinutes(orgCfg?.startTime || '09:30');
    const checkInMinutes = minutesOfDayLocal(eventTime, tz);
    const grace = Number(orgCfg?.gracePeriodMinutes || 0);
    const minutesLate = Math.max(0, checkInMinutes - startMinutes);
    const withinGrace = minutesLate <= grace;

    // Geofence check
    let geofenceResult = { required: false };
    let outsideGeofence = false;
    if (geofence && Array.isArray(geofence.locations) && geofence.locations.length > 0 && location?.latitude && location?.longitude) {
      let nearestDistance = Infinity;
      let nearestLabel = '';
      for (const loc of geofence.locations) {
        const dist = haversineDistanceMeters(location.latitude, location.longitude, loc.latitude, loc.longitude);
        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearestLabel = loc.label || '';
        }
      }
      const radius = geofence.radiusMeters || 100;
      const withinRadius = nearestDistance <= radius;
      geofenceResult = {
        required: true,
        radiusMeters: radius,
        nearestDistanceMeters: Math.round(nearestDistance),
        nearestLocationLabel: nearestLabel,
      };
      outsideGeofence = !withinRadius;
    } else if (geofence && geofence.required) {
      // Geofence required but no location provided
      geofenceResult = { required: true, radiusMeters: geofence.radiusMeters || 100 };
      outsideGeofence = true; // treat as outside when geofence required
    }

    // Enforce geofence: if required and outside, block check-in
    if (geofenceResult?.required && outsideGeofence) {
      throw new ApiError('You need to be in the location to check in', 400);
    }

    const dayRecord = {
      date: dateKey,
      weekday: weekdayNum,
      workingDay: wdCheck.isWorking,
      isHoliday,
      holidayName: holiday?.name || undefined,
      checkIn: {
        timestamp: eventTime,
        withinGrace,
        minutesLate,
        source,
        location: location || undefined,
        geofence: geofenceResult
      },
      outsideGeofence,
    };

    // Upsert monthly doc and set day record
    const filter = { organizationId, userId, year, month };
    const update = {
      $set: {
        timezone: tz,
        [`days.${dateKey}`]: dayRecord,
        updatedBy: userId
      },
      $setOnInsert: { createdBy: userId }
    };
    await MonthlyAttendance.updateOne(filter, update, { upsert: true });

    return successResponse(res, 201, 'Check-in recorded', {
      date: dateKey,
      summary: dayRecord
    });
  } catch (err) {
    next(err);
  }
};

export const checkOut = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const userId = req.user?._id;
    if (!organizationId || !userId) throw new ApiError('Organization or user context missing', 400);

    const { timestamp, location, source = 'web' } = req.body || {};
    const eventTime = timestamp ? new Date(timestamp) : new Date();

    const { tz } = await resolveGeofence(organizationId, userId);
    const dateKey = toLocalYMD(eventTime, tz);
    const { year, month } = localParts(eventTime, tz);

    // Leave check - prevent check-out on approved leave days
    const employee = await Employee.findOne({ userId, organizationId });
    if (employee) {
      const approvedLeave = await Leave.findOne({
        employeeId: employee._id,
        organizationId,
        status: 'approved',
        $or: [
          // Check if the date is in approvedDaysDetails array
          {
            approvedDaysDetails: {
              $elemMatch: {
                date: dateKey,
                approved: true
              }
            }
          },
          // Fallback: check if date is within leave period (for backward compatibility)
          {
            approvedDaysDetails: { $exists: false },
            startDate: { $lte: eventTime },
            endDate: { $gte: eventTime }
          }
        ]
      });

      if (approvedLeave) {
        // Check if it's a specific approved day
        const approvedDay = approvedLeave.approvedDaysDetails?.find(
          day => day.date === dateKey && day.approved
        );
        
        if (approvedDay) {
          if (approvedDay.isHalfDay) {
            // For half-day leaves, allow check-out only during the working period
            const currentHour = eventTime.getHours();
            const morningCutoff = 12; // 12 PM
            
            if (approvedDay.halfDayPeriod === 'morning' && currentHour < morningCutoff) {
              throw new ApiError('You are on approved morning leave and cannot check out', 400);
            } else if (approvedDay.halfDayPeriod === 'afternoon' && currentHour >= morningCutoff) {
              throw new ApiError('You are on approved afternoon leave and cannot check out', 400);
            }
          } else {
            // Full day leave - block check-out completely
            throw new ApiError('You are on approved leave and cannot check out', 400);
          }
        } else if (!approvedLeave.approvedDaysDetails) {
          // Fallback for old leave records without specific day details
          throw new ApiError('You are on approved leave and cannot check out', 400);
        }
      }
    }

    const filter = { organizationId, userId, year, month };
    const update = {
      $set: {
        [`days.${dateKey}.checkOut`]: {
          timestamp: eventTime,
          source,
          location: location || undefined,
        },
        updatedBy: userId
      },
      $setOnInsert: { createdBy: userId }
    };

    await MonthlyAttendance.updateOne(filter, update, { upsert: true });

    return successResponse(res, 201, 'Check-out recorded', { date: dateKey });
  } catch (err) {
    next(err);
  }
};

export const getMonthlyAttendance = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const userId = req.user?._id;
    if (!organizationId || !userId) throw new ApiError('Organization or user context missing', 400);

    const { month: monthStr } = req.query;
    const orgCfg = await AttendanceConfig.findOne({ organizationId }).lean();
    const tz = orgCfg?.timezone || 'UTC';
    const now = new Date();
    const { year: curYear, month: curMonth } = localParts(now, tz);

    const [yStr, mStr] = (monthStr || `${curYear}-${String(curMonth).padStart(2, '0')}`).split('-');
    const year = Number(yStr);
    const month = Number(mStr);

    const doc = await MonthlyAttendance.findOne({ organizationId, userId, year, month }).lean();

    return successResponse(res, 200, 'Monthly attendance retrieved', doc || {
      organizationId,
      userId,
      year,
      month,
      days: {},
      timezone: tz
    });
  } catch (err) {
    next(err);
  }
};

export const setAttendanceStatusForUser = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const adminId = req.user?._id;
    const { userId } = req.params;
    const { date, status, notes } = req.body || {};

    if (!organizationId || !adminId) throw new ApiError('Organization or user context missing', 400);
    if (!userId) throw new ApiError('Target userId is required', 400);

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      throw new ApiError('Date must be in YYYY-MM-DD format', 422);
    }
    if (!['present','absent','half-day'].includes(String(status))) {
      throw new ApiError('Status must be one of present, absent, half-day', 422);
    }

    const orgCfg = await AttendanceConfig.findOne({ organizationId }).lean();
    const tz = orgCfg?.timezone || 'UTC';
    const [yStr, mStr, dStr] = String(date).split('-');
    const y = Number(yStr), m = Number(mStr), d = Number(dStr);
    const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

    const dateKey = toLocalYMD(dateObj, tz);
    const { year, month } = localParts(dateObj, tz);
    const weekdayNum = localWeekdayNum(dateObj, tz);

    const wdCheck = computeWorkingDay(dateObj, orgCfg);
    const holiday = await findHolidayForDate(organizationId, dateObj, tz);
    const isHoliday = !!holiday;

    const baseMinutes = Number(
      orgCfg?.totalDailyWorkingMinutes ?? (
        parseHHmmToMinutes(orgCfg?.endTime || '18:00') -
        parseHHmmToMinutes(orgCfg?.startTime || '09:30') -
        Number(orgCfg?.breakMinutes || 0)
      )
    );

    const isPresent = status !== 'absent';
    const isHalfDay = status === 'half-day';
    const workedMinutes = isPresent ? (isHalfDay ? Math.max(0, Math.round(baseMinutes / 2)) : baseMinutes) : 0;

    const updates = {
      timezone: tz,
      [`days.${dateKey}.date`]: dateKey,
      [`days.${dateKey}.weekday`]: weekdayNum,
      [`days.${dateKey}.workingDay`]: wdCheck.isWorking,
      [`days.${dateKey}.isHoliday`]: isHoliday,
      [`days.${dateKey}.holidayName`]: holiday?.name || undefined,
      [`days.${dateKey}.isPresent`]: isPresent,
      [`days.${dateKey}.isHalfDay`]: isHalfDay,
      [`days.${dateKey}.workedMinutes`]: workedMinutes,
      [`days.${dateKey}.notes`]: notes || 'HR attendance override',
      updatedBy: adminId,
    };

    const filter = { organizationId, userId, year, month };
    const update = { $set: updates, $setOnInsert: { createdBy: adminId } };

    await MonthlyAttendance.updateOne(filter, update, { upsert: true });

    return successResponse(res, 200, 'Attendance status set', { userId, date: dateKey, status });
  } catch (err) {
    next(err);
  }
};

export const bulkSetAttendanceStatus = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const adminId = req.user?._id;
    const { date, status, notes, userIds, all } = req.body || {};

    if (!organizationId || !adminId) throw new ApiError('Organization or user context missing', 400);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      throw new ApiError('Date must be in YYYY-MM-DD format', 422);
    }
    if (!['present','absent','half-day'].includes(String(status))) {
      throw new ApiError('Status must be one of present, absent, half-day', 422);
    }

    let targets = [];
    if (all) {
      const employees = await Employee.find({ organizationId, 'baseInfo.status': 'active' }).select('userId').lean();
      targets = employees.map((e) => e.userId);
    } else {
      if (!Array.isArray(userIds) || userIds.length === 0) {
        throw new ApiError('userIds array is required when all=false', 400);
      }
      targets = userIds;
    }

    const orgCfg = await AttendanceConfig.findOne({ organizationId }).lean();
    const tz = orgCfg?.timezone || 'UTC';
    const [yStr, mStr, dStr] = String(date).split('-');
    const y = Number(yStr), m = Number(mStr), d = Number(dStr);
    const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

    const dateKey = toLocalYMD(dateObj, tz);
    const { year, month } = localParts(dateObj, tz);
    const weekdayNum = localWeekdayNum(dateObj, tz);

    const wdCheck = computeWorkingDay(dateObj, orgCfg);
    const holiday = await findHolidayForDate(organizationId, dateObj, tz);
    const isHoliday = !!holiday;

    const baseMinutes = Number(
      orgCfg?.totalDailyWorkingMinutes ?? (
        parseHHmmToMinutes(orgCfg?.endTime || '18:00') -
        parseHHmmToMinutes(orgCfg?.startTime || '09:30') -
        Number(orgCfg?.breakMinutes || 0)
      )
    );

    const isPresent = status !== 'absent';
    const isHalfDay = status === 'half-day';
    const workedMinutes = isPresent ? (isHalfDay ? Math.max(0, Math.round(baseMinutes / 2)) : baseMinutes) : 0;

    const updates = {
      timezone: tz,
      [`days.${dateKey}.date`]: dateKey,
      [`days.${dateKey}.weekday`]: weekdayNum,
      [`days.${dateKey}.workingDay`]: wdCheck.isWorking,
      [`days.${dateKey}.isHoliday`]: isHoliday,
      [`days.${dateKey}.holidayName`]: holiday?.name || undefined,
      [`days.${dateKey}.isPresent`]: isPresent,
      [`days.${dateKey}.isHalfDay`]: isHalfDay,
      [`days.${dateKey}.workedMinutes`]: workedMinutes,
      [`days.${dateKey}.notes`]: notes || 'HR attendance override',
      updatedBy: adminId,
    };

    let success = 0, failed = 0;
    for (const uid of targets) {
      try {
        const filter = { organizationId, userId: uid, year, month };
        const update = { $set: updates, $setOnInsert: { createdBy: adminId } };
        await MonthlyAttendance.updateOne(filter, update, { upsert: true });
        success++;
      } catch (e) {
        failed++;
      }
    }

    return successResponse(res, 200, 'Bulk attendance status set', {
      date: dateKey,
      status,
      total: targets.length,
      success,
      failed,
    });
  } catch (err) {
    next(err);
  }
};