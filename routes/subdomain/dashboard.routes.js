import express from 'express';
import { validateSubdomain } from '../../middleware/subdomain.middleware.js';
import { verifyTenantToken } from '../../middleware/tenantAuth.middleware.js';

const router = express.Router();

// Apply subdomain validation to all routes
router.use(validateSubdomain);
router.use(verifyTenantToken);

// Get organization dashboard data
router.get('/', async (req, res, next) => {
  try {
    const organization = req.organization;
    const user = req.user;
    
    // Basic dashboard data
    const dashboardData = {
      organization: {
        name: organization.name,
        logo: organization.logo,
        industry: organization.industry,
        employeeCount: organization.employeeCount
      },
      user: {
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        avatar: user.avatar
      },
      stats: {
        // These would be populated from actual data in a real implementation
        activeProjects: 5,
        pendingTasks: 8,
        upcomingEvents: 3,
        recentNotifications: 2
      }
    };
    
    res.status(200).json({
      success: true,
      message: 'Dashboard data retrieved successfully',
      data: dashboardData
    });
  } catch (error) {
    next(error);
  }
});

export default router;