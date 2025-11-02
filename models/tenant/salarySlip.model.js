import mongoose from 'mongoose';

const LineItemSchema = new mongoose.Schema({
  code: { type: String, trim: true },
  label: { type: String, trim: true },
  amount: { type: Number, default: 0 },
  type: { type: String, enum: ['earning','deduction','adjustment'], required: true }
}, { _id: false });

const AttendanceSummarySchema = new mongoose.Schema({
  workingDays: { type: Number, default: 0 },
  presentDays: { type: Number, default: 0 },
  halfDays: { type: Number, default: 0 },
  paidLeaveDays: { type: Number, default: 0 },
  unpaidLeaveDays: { type: Number, default: 0 },
  absentDays: { type: Number, default: 0 },
  workedMinutesTotal: { type: Number, default: 0 }
}, { _id: false });

const SalarySlipSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser', required: true, index: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  status: { type: String, enum: ['draft','finalized','paid'], default: 'draft' },
  lineItems: { type: [LineItemSchema], default: [] },
  grossAmount: { type: Number, default: 0 },
  totalDeductions: { type: Number, default: 0 },
  netPay: { type: Number, default: 0 },
  attendanceSummary: { type: AttendanceSummarySchema, default: () => ({}) },
  payDate: { type: Date },
  notes: { type: String, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser' }
}, { timestamps: true });

SalarySlipSchema.index({ organizationId: 1, userId: 1, year: 1, month: 1 }, { unique: true });

export default mongoose.model('SalarySlip', SalarySlipSchema);