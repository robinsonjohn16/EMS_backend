import mongoose from 'mongoose';

const LeaveTypePolicySchema = new mongoose.Schema({
  perYearDays: { type: Number, default: 0, min: 0, max: 365 },
  carryForward: { type: Boolean, default: false },
}, { _id: false });

// Add: Custom leave type schema for user-specific overrides
const CustomLeaveTypePolicySchema = new mongoose.Schema({
  code: { type: String, required: true, lowercase: true, trim: true },
  label: { type: String, default: '' },
  perYearDays: { type: Number, default: 0, min: 0, max: 365 },
  carryForward: { type: Boolean, default: false },
}, { _id: false });

const LeavePolicySchema = new mongoose.Schema({
  sick: { type: LeaveTypePolicySchema, default: () => ({ perYearDays: 0, carryForward: false }) },
  paid: { type: LeaveTypePolicySchema, default: () => ({ perYearDays: 0, carryForward: false }) },
  customTypes: { type: [CustomLeaveTypePolicySchema], default: [] }
}, { _id: false });

const GeofencingSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  radiusMeters: { type: Number, default: 100, min: 10, max: 10000 },
  locations: [{
    label: { type: String, trim: true },
    latitude: { type: Number },
    longitude: { type: Number },
  }],
}, { _id: false });

const UserAttendanceConfigSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser', required: true },
  leavePolicy: { type: LeavePolicySchema, default: () => ({ sick: { perYearDays: 0, carryForward: false }, paid: { perYearDays: 0, carryForward: false }, customTypes: [] }) },
  geofencing: { type: GeofencingSchema, default: () => ({}) },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser' },
}, { timestamps: true });

UserAttendanceConfigSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

export default mongoose.model('UserAttendanceConfig', UserAttendanceConfigSchema);