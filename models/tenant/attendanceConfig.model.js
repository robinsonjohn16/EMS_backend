import mongoose from 'mongoose';

// Generalized day rule schema to support odd/even/all for any weekday
const DayRuleSchema = new mongoose.Schema({
  rule: { type: String, enum: ['none','all','odd','even'], default: 'all' }
}, { _id: false });

// Weekday rules schema mapping each day to a rule
const WeekdayRulesSchema = new mongoose.Schema({
  monday: { type: DayRuleSchema, default: () => ({}) },
  tuesday: { type: DayRuleSchema, default: () => ({}) },
  wednesday: { type: DayRuleSchema, default: () => ({}) },
  thursday: { type: DayRuleSchema, default: () => ({}) },
  friday: { type: DayRuleSchema, default: () => ({}) },
  // Default Saturday and Sunday to non-working unless explicitly configured
  saturday: { type: DayRuleSchema, default: () => ({ rule: 'none' }) },
  sunday: { type: DayRuleSchema, default: () => ({ rule: 'none' }) }
}, { _id: false });

const WorkingDaysSchema = new mongoose.Schema({
  monday: { type: Boolean, default: true },
  tuesday: { type: Boolean, default: true },
  wednesday: { type: Boolean, default: true },
  thursday: { type: Boolean, default: true },
  friday: { type: Boolean, default: true },
  saturday: { type: Boolean, default: false },
  sunday: { type: Boolean, default: false }
}, { _id: false });

// Leave policy per type (sick/paid) with scope
const LeaveTypePolicySchema = new mongoose.Schema({
  perYearDays: { type: Number, default: 0, min: 0, max: 365 },
  carryForward: { type: Boolean, default: false },
  applyScope: { type: String, enum: ['organization','user-specific'], default: 'organization' },
  userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser' }]
}, { _id: false });

// New: Custom leave type schema
const CustomLeaveTypePolicySchema = new mongoose.Schema({
  code: { type: String, required: true, lowercase: true, trim: true },
  label: { type: String, default: '' },
  perYearDays: { type: Number, default: 0, min: 0, max: 365 },
  carryForward: { type: Boolean, default: false },
  applyScope: { type: String, enum: ['organization','user-specific'], default: 'organization' },
  userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser' }]
}, { _id: false });

const LeavePolicySchema = new mongoose.Schema({
  sick: { type: LeaveTypePolicySchema, default: () => ({ perYearDays: 0, carryForward: false, applyScope: 'organization', userIds: [] }) },
  paid: { type: LeaveTypePolicySchema, default: () => ({ perYearDays: 0, carryForward: false, applyScope: 'organization', userIds: [] }) },
  customTypes: { type: [CustomLeaveTypePolicySchema], default: [] }
}, { _id: false });

// Geofencing settings
const GeofencingSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  scope: { type: String, enum: ['organization','user-specific'], default: 'organization' },
  userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser' }],
  radiusMeters: { type: Number, default: 100, min: 10, max: 10000 },
  locations: [{
    label: { type: String, trim: true },
    latitude: { type: Number },
    longitude: { type: Number }
  }]
}, { _id: false });

const AttendanceConfigSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, 'Organization ID is required'],
    unique: true
  },
  startTime: {
    type: String, // HH:mm in 24-hour format
    required: [true, 'Start time is required'],
    match: [/^([01]\d|2[0-3]):([0-5]\d)$/,'Start time must be in HH:mm format']
  },
  // New: daily end time
  endTime: {
    type: String,
    required: [true, 'End time is required'],
    match: [/^([01]\d|2[0-3]):([0-5]\d)$/,'End time must be in HH:mm format']
  },
  // New: break minutes per day
  breakMinutes: {
    type: Number,
    default: 60,
    min: [0, 'Break minutes cannot be negative'],
    max: [300, 'Break minutes too large']
  },
  gracePeriodMinutes: {
    type: Number,
    default: 0,
    min: [0, 'Grace period cannot be negative'],
    max: [180, 'Grace period too large']
  },
  workingDays: {
    type: WorkingDaysSchema,
    default: () => ({})
  },
  // New: generalized weekday rules to extend Saturday rule to all days
  weekdayRules: {
    type: WeekdayRulesSchema,
    default: () => ({})
  },
  saturdayRule: {
    type: String,
    enum: ['none', 'odd', 'even', 'all'],
    default: 'none'
  },
  // New: computed total working minutes per day
  totalDailyWorkingMinutes: {
    type: Number,
    min: [0, 'Total working minutes cannot be negative'],
    default: 480
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  // New: leave policy configuration
  leavePolicy: {
    type: LeavePolicySchema,
    default: () => ({ sick: { perYearDays: 0, carryForward: false, applyScope: 'organization', userIds: [] }, paid: { perYearDays: 0, carryForward: false, applyScope: 'organization', userIds: [] }, customTypes: [] })
  },
  // New: geofencing configuration
  geofencing: {
    type: GeofencingSchema,
    default: () => ({ enabled: false, scope: 'organization', userIds: [], radiusMeters: 100, locations: [] })
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantUser'
  }
}, { timestamps: true });

export default mongoose.model('AttendanceConfig', AttendanceConfigSchema);