import mongoose from 'mongoose';

const DeductionTierSchema = new mongoose.Schema({
  minSalary: { type: Number, default: 0, min: 0 },
  maxSalary: { type: Number, default: null }, // null means no upper bound
  type: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
  value: { type: Number, default: 0, min: 0 },
  capAmount: { type: Number, default: null, min: 0 }
}, { _id: false });

const DeductionRuleSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  code: { type: String, required: true, lowercase: true, trim: true },
  label: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
  tiers: { type: [DeductionTierSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser' }
}, { timestamps: true });

DeductionRuleSchema.index({ organizationId: 1, code: 1 }, { unique: true });

export default mongoose.model('DeductionRule', DeductionRuleSchema);