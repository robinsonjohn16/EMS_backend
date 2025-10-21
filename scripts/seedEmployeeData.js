import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Organization from '../models/organization.model.js';
import TenantUser from '../models/tenant/auth.model.js';
import EmployeeField from '../models/tenant/employeeField.model.js';
import Employee from '../models/tenant/employee.model.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected for seeding'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Sample data
const sampleOrganization = {
  name: 'Demo Company',
  slug: 'demo-company',
  email: 'admin@democompany.com',
  phone: '123-456-7890',
  address: '123 Demo Street, Demo City, 12345',
  active: true
};

const sampleUsers = [
  {
    username: 'manager1',
    email: 'manager@democompany.com',
    password: 'Password123!',
    firstName: 'John',
    lastName: 'Manager',
    role: 'manager',
    department: 'Administration',
    position: 'General Manager',
    isActive: true
  },
  {
    username: 'hr1',
    email: 'hr@democompany.com',
    password: 'Password123!',
    firstName: 'Jane',
    lastName: 'HR',
    role: 'hr',
    department: 'Human Resources',
    position: 'HR Specialist',
    isActive: true
  },
  {
    username: 'employee1',
    email: 'employee1@democompany.com',
    password: 'Password123!',
    firstName: 'Bob',
    lastName: 'Smith',
    role: 'employee',
    department: 'Engineering',
    position: 'Software Developer',
    isActive: true
  },
  {
    username: 'employee2',
    email: 'employee2@democompany.com',
    password: 'Password123!',
    firstName: 'Alice',
    lastName: 'Johnson',
    role: 'employee',
    department: 'Marketing',
    position: 'Marketing Specialist',
    isActive: true
  }
];

const sampleFieldCategories = [
  {
    name: 'Personal Information',
    description: 'Basic personal information of the employee',
    order: 1,
    fields: [
      {
        name: 'dateOfBirth',
        label: 'Date of Birth',
        type: 'date',
        required: true,
        isEmployeeEditable: true,
        isHREditable: true,
        isVisible: true,
        order: 1
      },
      {
        name: 'gender',
        label: 'Gender',
        type: 'select',
        options: ['Male', 'Female', 'Other', 'Prefer not to say'],
        required: true,
        isEmployeeEditable: true,
        isHREditable: true,
        isVisible: true,
        order: 2
      },
      {
        name: 'maritalStatus',
        label: 'Marital Status',
        type: 'select',
        options: ['Single', 'Married', 'Divorced', 'Widowed'],
        required: false,
        isEmployeeEditable: true,
        isHREditable: true,
        isVisible: true,
        order: 3
      }
    ]
  },
  {
    name: 'Contact Information',
    description: 'Employee contact details',
    order: 2,
    fields: [
      {
        name: 'personalEmail',
        label: 'Personal Email',
        type: 'email',
        required: true,
        isEmployeeEditable: true,
        isHREditable: true,
        isVisible: true,
        order: 1
      },
      {
        name: 'phoneNumber',
        label: 'Phone Number',
        type: 'text',
        required: true,
        isEmployeeEditable: true,
        isHREditable: true,
        isVisible: true,
        order: 2
      },
      {
        name: 'address',
        label: 'Home Address',
        type: 'textarea',
        required: true,
        isEmployeeEditable: true,
        isHREditable: true,
        isVisible: true,
        order: 3
      }
    ]
  },
  {
    name: 'Emergency Contact',
    description: 'Emergency contact information',
    order: 3,
    fields: [
      {
        name: 'emergencyContactName',
        label: 'Emergency Contact Name',
        type: 'text',
        required: true,
        isEmployeeEditable: true,
        isHREditable: true,
        isVisible: true,
        order: 1
      },
      {
        name: 'emergencyContactRelation',
        label: 'Relationship',
        type: 'text',
        required: true,
        isEmployeeEditable: true,
        isHREditable: true,
        isVisible: true,
        order: 2
      },
      {
        name: 'emergencyContactPhone',
        label: 'Emergency Contact Phone',
        type: 'text',
        required: true,
        isEmployeeEditable: true,
        isHREditable: true,
        isVisible: true,
        order: 3
      }
    ]
  },
  {
    name: 'Employment Details',
    description: 'Employment-related information',
    order: 4,
    fields: [
      {
        name: 'employmentType',
        label: 'Employment Type',
        type: 'select',
        options: ['Full-time', 'Part-time', 'Contract', 'Intern'],
        required: true,
        isEmployeeEditable: false,
        isHREditable: true,
        isVisible: true,
        order: 1
      },
      {
        name: 'startDate',
        label: 'Start Date',
        type: 'date',
        required: true,
        isEmployeeEditable: false,
        isHREditable: true,
        isVisible: true,
        order: 2
      },
      {
        name: 'salary',
        label: 'Salary',
        type: 'number',
        required: true,
        isEmployeeEditable: false,
        isHREditable: true,
        isVisible: false, // Only visible to HR
        order: 3
      }
    ]
  }
];

// Sample employee data
const sampleEmployeeData = [
  {
    // For employee1
    baseInfo: {
      firstName: 'Bob',
      lastName: 'Smith',
      email: 'employee1@democompany.com',
      department: 'Engineering',
      position: 'Software Developer'
    },
    customFields: {
      'Personal Information': {
        dateOfBirth: '1990-05-15',
        gender: 'Male',
        maritalStatus: 'Single'
      },
      'Contact Information': {
        personalEmail: 'bob.personal@example.com',
        phoneNumber: '555-123-4567',
        address: '456 Employee St, Demo City, 12345'
      },
      'Emergency Contact': {
        emergencyContactName: 'Sarah Smith',
        emergencyContactRelation: 'Sister',
        emergencyContactPhone: '555-987-6543'
      },
      'Employment Details': {
        employmentType: 'Full-time',
        startDate: '2022-01-15',
        salary: 75000
      }
    }
  },
  {
    // For employee2
    baseInfo: {
      firstName: 'Alice',
      lastName: 'Johnson',
      email: 'employee2@democompany.com',
      department: 'Marketing',
      position: 'Marketing Specialist'
    },
    customFields: {
      'Personal Information': {
        dateOfBirth: '1992-08-22',
        gender: 'Female',
        maritalStatus: 'Married'
      },
      'Contact Information': {
        personalEmail: 'alice.personal@example.com',
        phoneNumber: '555-765-4321',
        address: '789 Worker Ave, Demo City, 12345'
      },
      'Emergency Contact': {
        emergencyContactName: 'Mike Johnson',
        emergencyContactRelation: 'Husband',
        emergencyContactPhone: '555-234-5678'
      },
      'Employment Details': {
        employmentType: 'Full-time',
        startDate: '2022-03-01',
        salary: 70000
      }
    }
  }
];

// Seed function
const seedDatabase = async () => {
  try {
    // Clear existing data
    await Organization.deleteMany({});
    await TenantUser.deleteMany({});
    await EmployeeField.deleteMany({});
    await Employee.deleteMany({});

    console.log('Cleared existing data');

    // Create a temporary admin user for createdBy references
    const tempAdmin = new mongoose.Types.ObjectId();

    // Create organization
    const organization = await Organization.create({
      ...sampleOrganization,
      createdBy: tempAdmin
    });
    console.log('Created organization:', organization.name);

    // Create users
    const createdUsers = [];
    for (const userData of sampleUsers) {
      const user = await TenantUser.create({
        ...userData,
        organization: organization._id,
        createdBy: tempAdmin // Use the temporary admin ID
      });
      createdUsers.push(user);
      console.log(`Created user: ${user.firstName} ${user.lastName} (${user.role})`);
    }

    // Update createdBy for all users to be the manager
    const manager = createdUsers.find(user => user.role === 'manager');
    await TenantUser.updateMany({}, { createdBy: manager._id });
    console.log('Updated createdBy for all users');

    // Create field categories
    const createdCategories = [];
    for (const categoryData of sampleFieldCategories) {
      const category = await EmployeeField.create({
        ...categoryData,
        organizationId: organization._id,
        createdBy: manager._id,
        updatedBy: manager._id
      });
      createdCategories.push(category);
      console.log(`Created field category: ${category.name}`);
    }

    // Create employee records
    for (let i = 0; i < sampleEmployeeData.length; i++) {
      const employeeData = sampleEmployeeData[i];
      const user = createdUsers.find(u => u.email === employeeData.baseInfo.email);
      
      if (!user) {
        console.error(`User not found for email: ${employeeData.baseInfo.email}`);
        continue;
      }

      // Convert customFields object to Map
      const customFieldsMap = new Map();
      for (const [categoryName, fields] of Object.entries(employeeData.customFields)) {
        customFieldsMap.set(categoryName, fields);
      }

      const employee = await Employee.create({
        organizationId: organization._id,
        userId: user._id,
        baseInfo: employeeData.baseInfo,
        customFields: customFieldsMap,
        filledFields: [], // Will be populated based on submitted fields
        lockedFields: [], // Will be populated based on submitted fields
        createdBy: manager._id,
        updatedBy: manager._id
      });

      console.log(`Created employee record for: ${employee.baseInfo.firstName} ${employee.baseInfo.lastName}`);
    }

    console.log('Database seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

// Run the seed function
seedDatabase();