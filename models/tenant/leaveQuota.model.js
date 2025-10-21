import mongoose from 'mongoose';

const LeaveTypeQuotaSchema = new mongoose.Schema({
  leaveType: {
    type: String,
    required: true,
    trim: true
  },
  total: {
    type: Number,
    default: 0,
    min: 0
  },
  used: {
    type: Number,
    default: 0,
    min: 0
  },
  pending: {
    type: Number,
    default: 0,
    min: 0
  },
  remaining: {
    type: Number,
    default: 0,
    min: 0
  }
}, { _id: false });

const LeaveQuotaSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, 'Organization ID is required'],
    index: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantUser',
    required: [true, 'User ID is required'],
    index: true
  },
  year: {
    type: Number,
    required: true,
    index: true
  },
  quotas: {
    type: [LeaveTypeQuotaSchema],
    default: []
  }
}, { timestamps: true });

LeaveQuotaSchema.index({ organizationId: 1, employeeId: 1, year: 1 }, { unique: true });

export default mongoose.model('LeaveQuota', LeaveQuotaSchema);