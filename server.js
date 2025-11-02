import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import connectDB from './config/db.js';
import morgan from 'morgan';
import http from 'http'
import path from 'path';
import { fileURLToPath } from 'url';


// Import routes
import authRoutes from './routes/auth.routes.js';
import organizationRoutes from './routes/organization.routes.js';
import tenantAuthRoutes from './routes/tenant/auth.routes.js';
import tenantUserRoutes from './routes/tenant/user.routes.js';
import tenantEmployeeRoutes from './routes/tenant/employee.routes.js';
import tenantEmployeeFieldRoutes from './routes/tenant/employeeField.routes.js';
import superAdminTenantUserRoutes from './routes/superAdmin/tenantUser.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import subdomainHolidayRoutes from './routes/subdomain/holiday.routes.js';
import subdomainUserAttendanceConfigRoutes from './routes/subdomain/userAttendanceConfig.routes.js'
import subdomainCalendarRoutes from './routes/subdomain/calendar.routes.js';
import tenantLeaveRoutes from './routes/tenant/leave.routes.js';
import tenantChatRoutes from './routes/tenant/chat.routes.js';
import initializeSocketIO from './socket/socketHandler.js';


// Import subdomain routes
import subdomainAuthRoutes from './routes/subdomain/auth.routes.js';
import subdomainDashboardRoutes from './routes/subdomain/dashboard.routes.js';
import subdomainUserRoutes from './routes/subdomain/user.routes.js';
import subdomainEmployeeRoutes from './routes/subdomain/employee.routes.js';
import subdomainAttendanceConfigRoutes from './routes/subdomain/attendanceConfig.routes.js';
import subdomainAttendanceRoutes from './routes/subdomain/attendance.routes.js';
import subdomainPayrollRoutes from './routes/subdomain/payroll.routes.js';
import {validateSubdomain} from './middleware/subdomain.middleware.js';
import { extractOrganization } from './middleware/subdomain.middleware.js';

// Load env vars
dotenv.config();

// Initialize express app
const app = express();

// Compute __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to database
connectDB();

// Middleware
app.use(cors({
  origin: [
    "https://admin-dev.wrenchly.in",
    "http://152.42.204.114:5173",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    // Allow any subdomain on localhost for development
    /^http:\/\/.*\.localhost:(5173|5174|5175)$/,
    // Allow any subdomain on production domains
    /^https:\/\/.*\.wrenchly\.in$/
  ],
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/organizations', organizationRoutes);
app.use('/api/v1/super-admin/tenant-users', superAdminTenantUserRoutes);

// Tenant routes (for super admin to manage tenants)
app.use('/api/v1/tenant/auth', tenantAuthRoutes);
app.use('/api/v1/tenant/users', tenantUserRoutes);
app.use('/api/v1/tenant/employees', tenantEmployeeRoutes);
app.use('/api/v1/tenant/employee-fields', tenantEmployeeFieldRoutes);
app.use('/api/v1/tenant/organization', organizationRoutes);
app.use('/api/v1/tenant/leaves', tenantLeaveRoutes);
app.use('/api/v1/tenant/chat', tenantChatRoutes);

// Subdomain routes (for tenant users accessing via subdomain)
app.use('/api/v1/subdomain/auth', subdomainAuthRoutes);
app.use('/api/v1/subdomain/dashboard', subdomainDashboardRoutes);
app.use('/api/v1/subdomain/users', subdomainUserRoutes);
app.use('/api/v1/subdomain/employees', subdomainEmployeeRoutes);
app.use('/api/v1/subdomain/attendance-config', subdomainAttendanceConfigRoutes);
app.use('/api/v1/subdomain/user-attendance-config', subdomainUserAttendanceConfigRoutes)
app.use('/api/v1/subdomain/organization', extractOrganization, (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      organization: req.organization
    }
  });
});
app.use('/api/v1/subdomain/holidays', subdomainHolidayRoutes);
app.use('/api/v1/subdomain/calendar', subdomainCalendarRoutes);
app.use('/api/v1/subdomain/attendance', subdomainAttendanceRoutes);
app.use('/api/v1/subdomain/payroll', subdomainPayrollRoutes);


// Default route
app.get('/', (req, res) => {
  res.send('EMS API is running');
});

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const server = http.createServer(app);

// Initialize Socket.IO
const io = initializeSocketIO(server);

// Make Socket.IO instance available to routes
app.set('io', io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.IO server initialized`);
});