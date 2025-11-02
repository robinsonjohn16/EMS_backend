import mongoose from 'mongoose';

const PayrollRunSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  status: { type: String, enum: ['draft','finalized','paid'], default: 'draft' },
  totalEmployees: { type: Number, default: 0 },
  finalizedCount: { type: Number, default: 0 },
  paidCount: { type: Number, default: 0 },
  slipIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SalarySlip' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantUser' }
}, { timestamps: true });

PayrollRunSchema.index({ organizationId: 1, year: 1, month: 1 }, { unique: true });

export default mongoose.model('PayrollRun', PayrollRunSchema);