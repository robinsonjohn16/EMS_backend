import mongoose from 'mongoose';

const EmployeeSchema = new mongoose.Schema({
  // Reference to the organization
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, 'Organization ID is required']
  },
  // Reference to the user account
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantUser',
    required: [true, 'User ID is required']
  },
  // Profile editing settings
  profileSettings: {
    canEditProfile: {
      type: Boolean,
      default: true
    },
    canChangePassword: {
      type: Boolean,
      default: true
    }
  },
  // Base information (always present)
  baseInfo: {
    employeeId: {
      type: String,
      trim: true
    },
    joiningDate: {
      type: Date
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'terminated'],
      default: 'active'
    }
  },
  // Custom fields data organized by category
  customFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Track which fields have been filled by employee
  filledFields: {
    type: [String],
    default: []
  },
  // Track which fields have been locked by employee submission
  lockedFields: {
    type: [String],
    default: []
  },

  // HR Approval Workflow
  approvalStatus: {
    status: {
      type: String,
      enum: ['draft', 'submitted', 'approved', 'rejected'],
      default: 'draft'
    },
    submittedAt: {
      type: Date
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TenantUser'
    },
    reviewedAt: {
      type: Date
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TenantUser'
    },
    reviewComments: {
      type: String,
      trim: true
    }
  },
    // Working days assignment
    workingDaysId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkingDays'
    },
    
    // Custom working schedule override
    customWorkingDays: {
      enabled: {
        type: Boolean,
        default: false
      },
      workingDays: [{
        type: Number,
        min: 0,
        max: 6
      }],
      workingHours: {
        startTime: {
          type: String,
          match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
        },
        endTime: {
          type: String,
          match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
        },
        breakDuration: {
          type: Number,
          default: 60 // minutes
        }
      }
    },
    
    // Geofencing settings
    geofencing: {
      enabled: {
        type: Boolean,
        default: false
      }
    },
    
    // Employee preferences
    preferences: {
      // Notification settings
      notifications: {
        emailNotifications: {
          type: Boolean,
          default: true
        },
        smsNotifications: {
          type: Boolean,
          default: false
        }
      },
      
      // Break preferences
      breakPreferences: {
        reminderEnabled: {
          type: Boolean,
          default: false
        },
        preferredBreakTimes: [String]
    }
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantUser',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantUser'
  }
}, {
  timestamps: true,
  strict: false // Allow dynamic fields
});

// Indexes for better query performance
EmployeeSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
EmployeeSchema.index({ 'baseInfo.employeeId': 1, organizationId: 1 });

const Employee = mongoose.model('Employee', EmployeeSchema);

export default Employee;