import Organization from '../models/organization.model.js';
import { ApiError } from '../utils/errorClasses.js';

// Middleware to validate and extract subdomain
const validateSubdomain = async (req, res, next) => {
  try {
    // Prefer Host header; fallback to Origin header if provided
    const originHeader = req.headers.origin;
    const rawHost = req.headers.host || (originHeader ? new URL(originHeader).host : null);
    const host = rawHost;
    if (!host) {
      return next(new ApiError(400, 'Host header is required'));
    }

    // Extract subdomain from host
    // Expected format: subdomain.domain.com or subdomain.app.domain.com (nested) or subdomain.localhost:3000
    const withoutPort = host.split(':')[0];
    const hostParts = withoutPort.split('.');
    
    // For development (localhost) or production with subdomain
    let subdomain = null;
    const baseLabel = process.env.APP_BASE_SUBDOMAIN || 'app';
    const mainHost = (process.env.APP_MAIN_HOST || '').toLowerCase(); // e.g., 'clone.moolaikal.com' or 'moolaikal.com'

    if (mainHost) {
      const hn = withoutPort.toLowerCase();
      if (hn === mainHost) {
        // Exact match to main app host -> not a tenant request
        subdomain = null;
      } else if (hn.endsWith(`.${mainHost}`)) {
        // tenant.mainHost -> take the left-most label as tenant slug
        subdomain = hostParts[0];
      } else if (host.includes('localhost')) {
        // Development helpers
        if (hostParts.length >= 2 && hostParts[1].includes('localhost')) {
          subdomain = hostParts[0];
        } else if (hostParts.length === 1) {
          subdomain = req.query.org || req.headers['x-organization-slug'] || req.headers['x-tenant-subdomain'];
        }
      } else if (hostParts.length >= 3) {
        // Fallback heuristic when mainHost does not match but host has subdomain
        subdomain = hostParts[0];
      }
    } else {
      // No main host configured; use heuristic similar to previous behavior
      if (hostParts.length >= 3) {
        subdomain = hostParts[0];
      } else if (hostParts.length === 2 && hostParts[1].includes('localhost')) {
        subdomain = hostParts[0];
      } else if (host.includes('localhost') && hostParts.length === 1) {
        subdomain = req.query.org || req.headers['x-organization-slug'] || req.headers['x-tenant-subdomain'];
      }
    }

    // Disallow reserved and base labels (e.g., app) from being treated as tenant slug
    if (!subdomain || subdomain === 'www' || subdomain === 'api' || subdomain === baseLabel) {
      return next(new ApiError(400, 'Invalid or missing organization subdomain'));
    }

    // Validate subdomain format (should match slug format)
    if (!/^[a-z0-9-]+$/.test(subdomain)) {
      return next(new ApiError(400, 'Invalid subdomain format. Only lowercase letters, numbers, and hyphens are allowed'));
    }

    // Find organization by slug
    const organization = await Organization.findBySlug(subdomain);
    
    if (!organization) {
      return next(new ApiError(404, 'Organization not found for this subdomain'));
    }

    if (!organization.active) {
      return next(new ApiError(403, 'Organization is not active'));
    }

    // Attach organization to request
    req.organization = organization;
    req.subdomain = subdomain;

    next();
  } catch (error) {
    next(error);
  }
};

// Middleware to check if user belongs to the organization from subdomain
const validateTenantAccess = (req, res, next) => {
  try {
    // This middleware should be used after authentication middleware
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required'));
    }

    if (!req.organization) {
      return next(new ApiError(400, 'Organization context not found'));
    }

    // Check if user belongs to this organization
    if (req.user.type === 'tenant' && req.user.organization.toString() !== req.organization._id.toString()) {
      return next(new ApiError(403, 'Access denied. User does not belong to this organization'));
    }

    // Super admins can access any organization
    if (req.user.type === 'super_admin') {
      return next();
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Middleware to extract organization from subdomain for public routes
const extractOrganization = async (req, res, next) => {
  try {
    const originHeader = req.headers.origin;
    const host = req.headers.host || (originHeader ? new URL(originHeader).host : null);
    if (!host) {
      return next();
    }

    const withoutPort = host.split(':')[0];
    const hostParts = withoutPort.split('.');
    let subdomain = null;
    const baseLabel = process.env.APP_BASE_SUBDOMAIN || 'app';
    const mainHost = (process.env.APP_MAIN_HOST || '').toLowerCase();

    if (mainHost) {
      const hn = withoutPort.toLowerCase();
      if (hn === mainHost) {
        subdomain = null;
      } else if (hn.endsWith(`.${mainHost}`)) {
        subdomain = hostParts[0];
      } else if (host.includes('localhost')) {
        if (hostParts.length >= 2 && hostParts[1].includes('localhost')) {
          subdomain = hostParts[0];
        } else if (hostParts.length === 1) {
          subdomain = req.query.org || req.headers['x-organization-slug'] || req.headers['x-tenant-subdomain'];
        }
      } else if (hostParts.length >= 3) {
        subdomain = hostParts[0];
      }
    } else {
      if (hostParts.length >= 3) {
        subdomain = hostParts[0];
      } else if (hostParts.length === 2 && hostParts[1].includes('localhost')) {
        subdomain = hostParts[0];
      } else if (host.includes('localhost') && hostParts.length === 1) {
        subdomain = req.query.org || req.headers['x-organization-slug'] || req.headers['x-tenant-subdomain'];
      }
    }

    if (subdomain && subdomain !== 'www' && subdomain !== 'api' && subdomain !== baseLabel && /^[a-z0-9-]+$/.test(subdomain)) {
      const organization = await Organization.findBySlug(subdomain);
      if (organization && organization.active) {
        req.organization = organization;
        req.subdomain = subdomain;
      }
    }

    next();
  } catch (error) {
    // Don't fail the request if organization extraction fails for public routes
    next();
  }
};

export {
  validateSubdomain,
  validateTenantAccess,
  extractOrganization
};