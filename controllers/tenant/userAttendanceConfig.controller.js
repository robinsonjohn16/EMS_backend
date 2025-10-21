import UserAttendanceConfig from '../../models/tenant/userAttendanceConfig.model.js';
// import Organization from '../../models/tenant/organization.model.js';
import TenantUser from '../../models/tenant/auth.model.js';
import { ApiError } from '../../utils/errorClasses.js';
import { successResponse } from '../../utils/apiResponse.js';

// Ensure the user belongs to the current organization
const assertUserInOrganization = async (organizationId, userId) => {
  if (!organizationId) throw new ApiError('Organization context missing', 400);
  if (!userId) throw new ApiError('User ID is required', 422);
  const user = await TenantUser.findOne({ _id: userId, organization: organizationId }).select('_id');
  if (!user) throw new ApiError('User does not belong to this organization', 404);
  return user;
};

const normalizeLeavePolicy = (leavePolicy = {}) => {
  const parseType = (t = {}) => ({
    perYearDays: Math.min(Math.max(Number(t.perYearDays || 0), 0), 365),
    carryForward: !!t.carryForward,
  });

  // Normalize custom types
  const rawCustom = Array.isArray(leavePolicy.customTypes) ? leavePolicy.customTypes : [];
  const seen = new Set();
  const customTypes = rawCustom
    .filter(ct => ct && typeof ct === 'object')
    .map(ct => ({
      code: String(ct.code || '').toLowerCase().trim(),
      label: String(ct.label || '').trim(),
      perYearDays: Math.min(Math.max(Number(ct.perYearDays || 0), 0), 365),
      carryForward: !!ct.carryForward,
    }))
    .filter(ct => ct.code) // require non-empty code
    .filter(ct => {
      if (seen.has(ct.code)) return false;
      seen.add(ct.code);
      return true;
    });

  return {
    sick: parseType(leavePolicy.sick),
    paid: parseType(leavePolicy.paid),
    customTypes,
  };
};

const normalizeGeofencing = (geo = {}) => {
  const enabled = !!geo.enabled;
  let radiusMeters = Number(geo.radiusMeters || 100);
  radiusMeters = Math.min(Math.max(radiusMeters, 10), 10000);
  const locations = Array.isArray(geo.locations)
    ? geo.locations
      .filter(l => l && typeof l === 'object' && typeof l.latitude === 'number' && typeof l.longitude === 'number')
      .map(l => ({ label: (l.label || '').trim(), latitude: l.latitude, longitude: l.longitude }))
    : [];
  return { enabled, radiusMeters, locations };
};

// GET /subdomain/user-attendance-config
export const listUserAttendanceConfigs = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    if (!organizationId) throw new ApiError('Organization context missing', 400);
    const docs = await UserAttendanceConfig.find({ organizationId })
      .select('userId leavePolicy geofencing updatedAt')
      .lean();
    return successResponse(res, 200, 'User attendance overrides retrieved', docs || []);
  } catch (err) {
    next(err);
  }
};

// GET /subdomain/user-attendance-config/:userId
export const getUserAttendanceConfig = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const { userId } = req.params;
    await assertUserInOrganization(organizationId, userId);

    const doc = await UserAttendanceConfig.findOne({ organizationId, userId }).lean();
    if (!doc) {
      const defaults = {
        _id: null,
        organizationId,
        userId,
        leavePolicy: { sick: { perYearDays: 0, carryForward: false }, paid: { perYearDays: 0, carryForward: false }, customTypes: [] },
        geofencing: { enabled: false, radiusMeters: 100, locations: [] },
      };
      return successResponse(res, 200, 'User attendance override retrieved', defaults);
    }
    return successResponse(res, 200, 'User attendance override retrieved', doc);
  } catch (err) {
    next(err);
  }
};

// PUT /subdomain/user-attendance-config/:userId
export const upsertUserAttendanceConfig = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const updatedBy = req.user?._id;
    const { userId } = req.params;

    await assertUserInOrganization(organizationId, userId);

    const leavePolicy = normalizeLeavePolicy(req.body?.leavePolicy || {});
    const geofencing = normalizeGeofencing(req.body?.geofencing || {});

    const payload = {
      organizationId,
      userId,
      leavePolicy,
      geofencing,
      updatedBy,
    };

    const updatedDoc = await UserAttendanceConfig.findOneAndUpdate(
      { organizationId, userId },
      payload,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return successResponse(res, 200, 'User attendance override saved', updatedDoc);
  } catch (err) {
    next(err);
  }
};