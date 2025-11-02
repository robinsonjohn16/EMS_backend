import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Organization from '../organization.model.js';

const tenantUserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [30, 'Username must be less than 30 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  firstName: {
    type: String,
    trim: true,
    maxlength: [50, 'First name must be less than 50 characters']
  },
  lastName: {
    type: String,
    trim: true,
    maxlength: [50, 'Last name must be less than 50 characters']
  },
  phone: {
    type: String,
    trim: true,
    maxlength: [20, 'Phone number must be less than 20 characters']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, 'Organization is required']
  },
  role: {
    type: String,
    enum: ['manager', 'hr', 'employee'],
    default: 'employee',
    required: [true, 'Role is required']
  },
  department: {
    type: String,
    trim: true,
    maxlength: [100, 'Department must be less than 100 characters']
  },
  position: {
    type: String,
    trim: true,
    maxlength: [100, 'Position must be less than 100 characters']
  },
  // Added core employment and identity fields
  employeeId: { type: String, trim: true },
  dateOfJoining: { type: Date },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  panNumber: { type: String, trim: true },
  aadhaarNumber: { type: String, trim: true },
  uanNumber: { type: String, trim: true },
  esicIpNumber: { type: String, trim: true },
  bankAccountNumber: { type: String, trim: true },
  ifscCode: { type: String, trim: true },
  avatar: { type: String, trim: true },
  isActive: {
    type: Boolean,
    default: true
  },
  online: {
    type: Boolean,
    default: false
  },
  lastSeenAt: {
    type: Date
  },
  // New: explicit HR feature selections (controlled via Settings UI)
  hrFeatureAccess: {
    attendanceConfig: { type: Boolean, default: false },
    leavePolicy: { type: Boolean, default: false },
    geofencing: { type: Boolean, default: false }
  },
  refreshToken: {
    type: String,
    select: false
  },
  lastLogin: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin', // Reference to super admin who created this user
    required: true
  }
}, {
  timestamps: true
});

// Index for better query performance
tenantUserSchema.index({ organization: 1, email: 1 });
tenantUserSchema.index({ organization: 1, username: 1 });
tenantUserSchema.index({ organization: 1, online: 1 });
// Ensure employeeId is unique per organization when present
tenantUserSchema.index({ organization: 1, employeeId: 1 }, { unique: true, sparse: true });

// Hash password before saving
tenantUserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Auto-generate employeeId for employees if missing
tenantUserSchema.pre('save', async function(next) {
  try {
    if (this.isNew && (!this.employeeId || !this.employeeId.trim()) && this.role === 'employee') {
      const org = await Organization.findById(this.organization).lean();
      const base = (org?.slug || org?.name || 'EMP').toString().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
      const prefix = base || 'EMP';
      const count = await mongoose.model('TenantUser').countDocuments({ organization: this.organization, employeeId: new RegExp(`^${prefix}`) });
      const nextNum = String(count + 1).padStart(4, '0');
      this.employeeId = `${prefix}${nextNum}`;
    }
    // Normalize certain identity fields
    if (this.panNumber) this.panNumber = this.panNumber.toUpperCase().trim();
    if (this.ifscCode) this.ifscCode = this.ifscCode.toUpperCase().trim();
    next();
  } catch (err) {
    next(err);
  }
});

// Static method to find user by organization and email
tenantUserSchema.statics.findByOrganizationAndEmail = function(organizationId, email) {
  return this.findOne({ organization: organizationId, email: email.toLowerCase() });
};

// Static method to find user by organization and username
tenantUserSchema.statics.findByOrganizationAndUsername = function(organizationId, username) {
  return this.findOne({ organization: organizationId, username: username });
};

// Generate next employeeId for an organization (helper)
tenantUserSchema.statics.generateEmployeeIdForOrg = async function(organizationId) {
  const org = await Organization.findById(organizationId).lean();
  const base = (org?.slug || org?.name || 'EMP').toString().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  const prefix = base || 'EMP';
  const count = await this.countDocuments({ organization: organizationId, employeeId: new RegExp(`^${prefix}`) });
  const nextNum = String(count + 1).padStart(4, '0');
  return `${prefix}${nextNum}`;
};

// Compare password method
tenantUserSchema.methods.comparePassword = async function(candidatePassword) {
  console.log('Candidate password:', candidatePassword);
  console.log('Stored password:', this.password);
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate access token
tenantUserSchema.methods.generateAccessToken = function() {
  return jwt.sign(
    {
      _id: this._id,
      username: this.username,
      email: this.email,
      role: this.role,
      organization: this.organization,
      type: 'tenant'
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  );
};

// Generate refresh token
tenantUserSchema.methods.generateRefreshToken = function() {
  return jwt.sign(
    {
      _id: this._id,
      type: 'tenant'
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
    }
  );
};

// Update last login
tenantUserSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  return this.save();
};

// Virtual for full name (if needed later)
tenantUserSchema.virtual('displayName').get(function() {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.username;
});

tenantUserSchema.virtual('fullName').get(function() {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.username;
});

// Transform output
tenantUserSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.refreshToken;
  delete user.__v;
  return user;
};

const TenantUser = mongoose.model('TenantUser', tenantUserSchema);

export default TenantUser;