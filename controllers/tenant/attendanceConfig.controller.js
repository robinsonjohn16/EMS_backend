import AttendanceConfig from '../../models/tenant/attendanceConfig.model.js';
import Organization from '../../models/organization.model.js';
import TenantUser from '../../models/tenant/auth.model.js';
import { successResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/errorClasses.js';

// Helper to compute total working minutes per day
const computeTotalMinutes = (startTime, endTime, breakMinutes = 0) => {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const total = end - start - (breakMinutes || 0);
  return Math.max(0, total);
};

// Get attendance config for current organization (via subdomain)
export const getAttendanceConfig = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    if (!organizationId) {
      throw new ApiError('Organization context missing', 400);
    }

    let configDoc = await AttendanceConfig.findOne({ organizationId });

    if (!configDoc) {
      const org = await Organization.findById(organizationId);
      const defaults = {
        organizationId,
        startTime: '09:30',
        endTime: '18:00',
        breakMinutes: 60,
        gracePeriodMinutes: 10,
        workingDays: {
          monday: true,
          tuesday: true,
          wednesday: true,
          thursday: true,
          friday: true,
          saturday: false,
          sunday: false,
        },
        // Default rules: Mon-Fri all, Saturday none, Sunday none
        weekdayRules: {
          monday: { rule: 'all' },
          tuesday: { rule: 'all' },
          wednesday: { rule: 'all' },
          thursday: { rule: 'all' },
          friday: { rule: 'all' },
          saturday: { rule: 'none' },
          sunday: { rule: 'none' },
        },
        saturdayRule: 'none',
        timezone: org?.timezone || 'UTC',
        totalDailyWorkingMinutes: computeTotalMinutes('09:30', '18:00', 60),
        // New: leave policy and geofencing defaults
        leavePolicy: {
          sick: { perYearDays: 0, carryForward: false, applyScope: 'organization', userIds: [] },
          paid: { perYearDays: 0, carryForward: false, applyScope: 'organization', userIds: [] },
          customTypes: []
        },
        geofencing: {
          enabled: false,
          scope: 'organization',
          userIds: [],
          radiusMeters: 100,
          locations: []
        },
        _id: null,
      };
      return successResponse(res, 200, 'Attendance config retrieved successfully', defaults);
    }

    return successResponse(res, 200, 'Attendance config retrieved successfully', configDoc);
  } catch (error) {
    next(error);
  }
};

// Upsert attendance config (HR/Manager only)
export const upsertAttendanceConfig = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const updatedBy = req.user?._id;

    if (!organizationId) {
      throw new ApiError('Organization context missing', 400);
    }

    const {
      startTime,
      endTime,
      breakMinutes,
      gracePeriodMinutes,
      workingDays,
      saturdayRule,
      weekdayRules,
      timezone,
      // New: leave policy & geofencing
      leavePolicy,
      geofencing,
    } = req.body || {};

    // Basic validation
    if (!startTime || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(startTime)) {
      throw new ApiError('Start time must be in HH:mm format', 422);
    }
    if (!endTime || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(endTime)) {
      throw new ApiError('End time must be in HH:mm format', 422);
    }
    if (breakMinutes !== undefined && (breakMinutes < 0 || breakMinutes > 300)) {
      throw new ApiError('Break minutes must be between 0 and 300', 422);
    }
    if (gracePeriodMinutes !== undefined && (gracePeriodMinutes < 0 || gracePeriodMinutes > 180)) {
      throw new ApiError('Grace period must be between 0 and 180 minutes', 422);
    }
    if (saturdayRule && !['none', 'odd', 'even', 'all'].includes(saturdayRule)) {
      throw new ApiError('Invalid saturday rule', 422);
    }

    // Normalize weekday rules; allow extending Saturday rule to other days
    const normalizeRule = (r) => ['none','all','odd','even'].includes(r) ? r : 'all';
    const mergedWeekdayRules = {
      monday: { rule: normalizeRule(weekdayRules?.monday?.rule || 'all') },
      tuesday: { rule: normalizeRule(weekdayRules?.tuesday?.rule || 'all') },
      wednesday: { rule: normalizeRule(weekdayRules?.wednesday?.rule || 'all') },
      thursday: { rule: normalizeRule(weekdayRules?.thursday?.rule || 'all') },
      friday: { rule: normalizeRule(weekdayRules?.friday?.rule || 'all') },
      saturday: { rule: normalizeRule(weekdayRules?.saturday?.rule || 'none') },
      sunday: { rule: normalizeRule(weekdayRules?.sunday?.rule || 'none') },
    };

    // Validate and normalize leave policy
    const validateUserIds = async (ids = []) => {
      if (!Array.isArray(ids) || ids.length === 0) return [];
      const users = await TenantUser.find({ _id: { $in: ids }, organization: organizationId }).select('_id');
      const validIds = users.map(u => u._id.toString());
      return ids.filter(id => validIds.includes(id.toString()));
    };

    const normalizeLeaveType = async (typeObj) => {
      if (!typeObj) return { perYearDays: 0, carryForward: false, applyScope: 'organization', userIds: [] };
      const perYearDays = Math.min(Math.max(Number(typeObj.perYearDays || 0), 0), 365);
      const carryForward = !!typeObj.carryForward;
      // Enforce global-only scope for leave policy
      const applyScope = 'organization';
      const userIds = [];
      return { perYearDays, carryForward, applyScope, userIds };
    };

    const normalizeCode = (code) => (code || '')
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-_]/g, '')
      .slice(0, 32);

    const normalizeCustomTypes = async (types) => {
      if (!Array.isArray(types)) return [];
      const seen = new Set();
      const list = [];
      for (const t of types) {
        const code = normalizeCode(t?.code || t?.label || '');
        if (!code || seen.has(code)) continue;
        seen.add(code);
        const label = (t?.label || code).toString().trim().slice(0, 50);
        const perYearDays = Math.min(Math.max(Number(t?.perYearDays || 0), 0), 365);
        const carryForward = !!t?.carryForward;
        list.push({ code, label, perYearDays, carryForward, applyScope: 'organization', userIds: [] });
      }
      return list;
    };

    const normalizedLeavePolicy = {
      sick: await normalizeLeaveType(leavePolicy?.sick),
      paid: await normalizeLeaveType(leavePolicy?.paid),
      customTypes: await normalizeCustomTypes(leavePolicy?.customTypes),
    };

    // Validate and normalize geofencing
    const normalizeGeofencing = async (geo) => {
      const enabled = !!geo?.enabled;
      // Enforce global-only scope for geofencing
      const scope = 'organization';
      const userIds = [];
      let radiusMeters = Number(geo?.radiusMeters || 100);
      radiusMeters = Math.min(Math.max(radiusMeters, 10), 10000);
      const locations = Array.isArray(geo?.locations) ? geo.locations
        .filter(l => l && typeof l === 'object' && typeof l.latitude === 'number' && typeof l.longitude === 'number')
        .map(l => ({ label: (l.label || '').trim(), latitude: l.latitude, longitude: l.longitude }))
        : [];
      return { enabled, scope, userIds, radiusMeters, locations };
    };

    const normalizedGeofencing = await normalizeGeofencing(geofencing || {});

    const totalDailyWorkingMinutes = computeTotalMinutes(startTime, endTime, breakMinutes || 0);

    const payload = {
      organizationId,
      startTime,
      endTime,
      breakMinutes: breakMinutes || 0,
      gracePeriodMinutes: gracePeriodMinutes || 0,
      workingDays: {
        monday: !!workingDays?.monday,
        tuesday: !!workingDays?.tuesday,
        wednesday: !!workingDays?.wednesday,
        thursday: !!workingDays?.thursday,
        friday: !!workingDays?.friday,
        saturday: !!workingDays?.saturday,
        sunday: !!workingDays?.sunday,
      },
      saturdayRule: saturdayRule || 'none',
      weekdayRules: mergedWeekdayRules,
      timezone: timezone || 'UTC',
      totalDailyWorkingMinutes,
      leavePolicy: normalizedLeavePolicy,
      geofencing: normalizedGeofencing,
      updatedBy,
    };

    const updatedDoc = await AttendanceConfig.findOneAndUpdate(
      { organizationId },
      payload,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return successResponse(res, 200, 'Attendance config updated successfully', updatedDoc);
  } catch (error) {
    next(error);
  }
};