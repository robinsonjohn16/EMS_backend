import mongoose from 'mongoose';

const HolidaySchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, 'Organization ID is required'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Holiday name is required'],
    trim: true,
    maxlength: [100, 'Holiday name too long']
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  date: {
    type: Date,
    required: [true, 'Holiday date is required']
  },
  recurrence: {
    type: String,
    enum: ['none', 'yearly'],
    default: 'none'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantUser'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantUser'
  }
}, {
  timestamps: true
});

// Index to prevent easy duplicates within an organization by name and date
HolidaySchema.index({ organizationId: 1, name: 1, date: 1 }, { unique: false });
// Unique index: enforce one holiday per organization by name (case-insensitive)
HolidaySchema.index({ organizationId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export default mongoose.model('Holiday', HolidaySchema);