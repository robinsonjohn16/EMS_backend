import mongoose from 'mongoose';

const LocationSchema = new mongoose.Schema({
  latitude: { type: Number },
  longitude: { type: Number },
}, { _id: false });

const GeofenceResultSchema = new mongoose.Schema({
  required: { type: Boolean, default: false },
  radiusMeters: { type: Number },
  nearestDistanceMeters: { type: Number },
  nearestLocationLabel: { type: String },
}, { _id: false });

const CheckInSchema = new mongoose.Schema({
  timestamp: { type: Date, required: true },
  withinGrace: { type: Boolean, default: true },
  minutesLate: { type: Number, default: 0, min: 0 },
  source: { type: String, enum: ['web','mobile','api'], default: 'web' },
  location: { type: LocationSchema, default: () => ({}) },
  geofence: { type: GeofenceResultSchema, default: () => ({}) },
}, { _id: false });

const CheckOutSchema = new mongoose.Schema({
  timestamp: { type: Date },
  source: { type: String, enum: ['web','mobile','api'], default: 'web' },
  location: { type: LocationSchema, default: () => ({}) },
}, { _id: false });

const DayAttendanceSchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD in org timezone
  weekday: { type: Number, min: 0, max: 6 },
  workingDay: { type: Boolean, default: true },
  isHoliday: { type: Boolean, default: false },
  holidayName: { type: String },
  checkIn: { type: CheckInSchema, default: null },
  checkOut: { type: CheckOutSchema, default: null },
  outsideGeofence: { type: Boolean, default: false },
  // NEW: attendance outcome flags
  isLeaveApproved: { type: Boolean, default: false },
  isHalfDay: { type: Boolean, default: false },
  isPresent: { type: Boolean, default: false },
  workedMinutes: { type: Number, default: 0, min: 0 },
  notes: { type: String, trim: true },
}, { _id: false });

// Map keyed by local date string for efficient updates
const MonthlyAttendanceSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser', required: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  days: { type: Map, of: DayAttendanceSchema, default: {} },
  timezone: { type: String, default: 'UTC' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser' },
}, { timestamps: true });

MonthlyAttendanceSchema.index({ organizationId: 1, userId: 1, year: 1, month: 1 }, { unique: true });

export default mongoose.model('MonthlyAttendance', MonthlyAttendanceSchema);