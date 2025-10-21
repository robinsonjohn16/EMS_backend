import Holiday from '../../models/tenant/holiday.model.js';
import { successResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/errorClasses.js';

const computeOccurrenceDate = (date, year, recurrence) => {
  try {
    const base = new Date(date);
    if (recurrence === 'yearly') {
      // Preserve month/day, set year to requested one
      const d = new Date(base);
      d.setFullYear(Number(year));
      return d;
    }
    return base;
  } catch (e) {
    return new Date(date);
  }
};

export const listHolidays = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const { year } = req.query;

    if (!organizationId) throw new ApiError('Organization context missing', 400);

    // Return all holidays for management; frontend filters active for calendar overlay
    const holidays = await Holiday.find({ organizationId }).sort({ date: 1 });

    const data = holidays.map((h) => {
      const occurrenceDate = year ? computeOccurrenceDate(h.date, year, h.recurrence) : h.date;
      return {
        ...h.toObject(),
        occurrenceDate
      };
    });

    return successResponse(res, 200, 'Holidays retrieved successfully', data);
  } catch (error) {
    next(error);
  }
};

export const createHoliday = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const userId = req.user?._id;
    if (!organizationId) throw new ApiError('Organization context missing', 400);

    const { name, date, recurrence = 'none', description, isActive = true } = req.body || {};

    if (!name) throw new ApiError('Holiday name is required', 422);
    if (!date) throw new ApiError('Holiday date is required', 422);
    if (!['none', 'yearly'].includes(recurrence)) throw new ApiError('Invalid recurrence value', 422);

    // Prevent duplicate names within the same organization (case-insensitive)
    const existing = await Holiday.findOne({ organizationId, name }).collation({ locale: 'en', strength: 2 });
    if (existing) throw new ApiError('Holiday with the same name already exists', 409);

    const holiday = new Holiday({
      organizationId,
      name,
      date: new Date(date),
      recurrence,
      description,
      isActive,
      createdBy: userId
    });

    try {
      await holiday.save();
    } catch (err) {
      if (err?.code === 11000) {
        return next(new ApiError('Holiday with the same name already exists', 409));
      }
      throw err;
    }

    return successResponse(res, 201, 'Holiday created successfully', holiday);
  } catch (error) {
    next(error);
  }
};

export const updateHoliday = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const userId = req.user?._id;
    const { holidayId } = req.params;

    if (!organizationId) throw new ApiError('Organization context missing', 400);

    const holiday = await Holiday.findOne({ _id: holidayId, organizationId });
    if (!holiday) throw new ApiError('Holiday not found', 404);

    const { name, date, recurrence, description, isActive } = req.body || {};

    if (name !== undefined) {
      // Check duplicate if name is changing (case-insensitive)
      const normalizedNew = String(name).trim().toLowerCase();
      const normalizedOld = String(holiday.name).trim().toLowerCase();
      if (normalizedNew !== normalizedOld) {
        const dup = await Holiday.findOne({ organizationId, name }).collation({ locale: 'en', strength: 2 });
        if (dup && String(dup._id) !== String(holidayId)) {
          throw new ApiError('Holiday with the same name already exists', 409);
        }
      }
      holiday.name = name;
    }
    if (date !== undefined) holiday.date = new Date(date);
    if (recurrence !== undefined) {
      if (!['none', 'yearly'].includes(recurrence)) throw new ApiError('Invalid recurrence value', 422);
      holiday.recurrence = recurrence;
    }
    if (description !== undefined) holiday.description = description;
    if (isActive !== undefined) holiday.isActive = !!isActive;

    holiday.updatedBy = userId;

    try {
      await holiday.save();
    } catch (err) {
      if (err?.code === 11000) {
        return next(new ApiError('Holiday with the same name already exists', 409));
      }
      throw err;
    }

    return successResponse(res, 200, 'Holiday updated successfully', holiday);
  } catch (error) {
    next(error);
  }
};

export const deleteHoliday = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const { holidayId } = req.params;
    if (!organizationId) throw new ApiError('Organization context missing', 400);

    const holiday = await Holiday.findOne({ _id: holidayId, organizationId });
    if (!holiday) throw new ApiError('Holiday not found', 404);

    await Holiday.deleteOne({ _id: holidayId });
    return successResponse(res, 200, 'Holiday deleted successfully', null);
  } catch (error) {
    next(error);
  }
};