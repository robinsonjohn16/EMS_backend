import mongoose from 'mongoose';

const LeaveSchema = new mongoose.Schema({
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
  leaveType: {
    type: String,
    enum: ['sick', 'paid', 'casual', 'annual', 'unpaid'],
    required: [true, 'Leave type is required']
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  isHalfDay: {
    type: Boolean,
    default: false
  },
  halfDayPeriod: {
    type: String,
    enum: ['morning', 'afternoon', null],
    default: null
  },
  reason: {
    type: String,
    trim: true,
    maxlength: 500
  },
  attachments: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
    index: true
  },
  // Add payStatus to record HR-approved pay classification
  payStatus: {
    type: String,
    enum: ['paid', 'unpaid'],
    default: null
  },
  // NEW: Approved days (supports partial approvals)
  approvedDays: {
    type: Number,
    min: 0,
    default: null
  },
  approvedDaysDetails: [{
    date: {
      type: String, // YYYY-MM-DD format
      required: true
    },
    isHalfDay: {
      type: Boolean,
      default: false
    },
    halfDayPeriod: {
      type: String,
      enum: ['morning', 'afternoon'],
      default: null
    },
    approved: { type: Boolean, default: true }
  }],
  requestedDaysDetails: [{
    date: { type: String, required: true }, // YYYY-MM-DD
    isHalfDay: { type: Boolean, default: false },
    halfDayPeriod: { type: String, enum: ['morning','afternoon', null], default: null }
  }],
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantUser',
    default: null
  },
  approvalDate: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    trim: true,
    default: null
  }
}, { timestamps: true });

// Index for date range queries
LeaveSchema.index({ organizationId: 1, employeeId: 1, startDate: 1, endDate: 1 });

export default mongoose.model('Leave', LeaveSchema);