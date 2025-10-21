import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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
  isActive: {
    type: Boolean,
    default: true
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

// Static method to find user by organization and email
tenantUserSchema.statics.findByOrganizationAndEmail = function(organizationId, email) {
  return this.findOne({ organization: organizationId, email: email.toLowerCase() });
};

// Static method to find user by organization and username
tenantUserSchema.statics.findByOrganizationAndUsername = function(organizationId, username) {
  return this.findOne({ organization: organizationId, username: username });
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