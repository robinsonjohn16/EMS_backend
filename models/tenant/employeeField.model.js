import mongoose from 'mongoose';

// Schema for field definitions
const FieldDefinitionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Field name is required'],
    trim: true
  },
  label: {
    type: String,
    required: [true, 'Field label is required'],
    trim: true
  },
  type: {
    type: String,
    required: [true, 'Field type is required'],
    enum: ['text', 'number', 'date', 'select', 'multiselect', 'checkbox', 'radio', 'textarea', 'email', 'phone', 'file', 'image', 'url'],
    default: 'text'
  },
  description: {
    type: String,
    trim: true
  },
  placeholder: {
    type: String,
    trim: true
  },
  defaultValue: {
    type: mongoose.Schema.Types.Mixed
  },
  options: {
    type: [String], // For select, multiselect, radio fields
    default: []
  },
  acceptedTypes: {
    type: String, // For file fields - comma separated file extensions
    trim: true
  },
  validation: {
    required: {
      type: Boolean,
      default: false
    },
    min: Number,
    max: Number,
    pattern: String,
    errorMessage: String
  },
  isHREditable: {
    type: Boolean,
    default: true,
    description: 'Whether HR can edit this field after employee has filled it'
  },
  isEmployeeEditable: {
    type: Boolean,
    default: true,
    description: 'Whether employee can edit this field'
  },
  isVisible: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  }
}, { _id: true });

// Schema for field categories
const EmployeeFieldSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, 'Organization ID is required']
  },
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  fields: [FieldDefinitionSchema],
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
  timestamps: true
});

// Index for better query performance
EmployeeFieldSchema.index({ organizationId: 1, name: 1 });

const EmployeeField = mongoose.model('EmployeeField', EmployeeFieldSchema);

export default EmployeeField;