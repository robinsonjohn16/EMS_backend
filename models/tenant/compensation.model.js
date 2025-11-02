import mongoose from 'mongoose';

const AllowanceSchema = new mongoose.Schema({
  code: { type: String, trim: true },
  label: { type: String, trim: true },
  // Support both fixed amount and percent-of-base
  type: { type: String, enum: ['percent', 'fixed'], default: 'fixed' },
  value: { type: Number, default: 0, min: 0 },
  // Back-compat: keep amount field if previously stored
  amount: { type: Number, default: 0, min: 0 }
}, { _id: false });

const DeductionOverrideSchema = new mongoose.Schema({
  code: { type: String, trim: true },
  label: { type: String, trim: true },
  type: { type: String, enum: ['percent', 'fixed'], default: 'fixed' },
  value: { type: Number, default: 0, min: 0 },
  apply: { type: Boolean, default: true },
  capAmount: { type: Number, default: null, min: 0 }
}, { _id: false });

const CompensationSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser', required: true, index: true },
  salaryType: { type: String, enum: ['monthly'], default: 'monthly' },
  baseSalary: { type: Number, required: true, min: 0 },
  allowances: { type: [AllowanceSchema], default: [] },
  variableComponents: { type: [AllowanceSchema], default: [] },
  deductionOverrides: { type: [DeductionOverrideSchema], default: [] },
  effectiveFrom: { type: Date, default: () => new Date() },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser' }
}, { timestamps: true });

CompensationSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

export default mongoose.model('Compensation', CompensationSchema);