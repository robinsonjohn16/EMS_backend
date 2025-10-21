import express from 'express';
import { authenticateTenant } from '../../middleware/tenantAuth.middleware.js';
import { validateSubdomain, validateTenantAccess, extractOrganization } from '../../middleware/subdomain.middleware.js';
import {
  listContacts,
  getMyRooms,
  createDirectRoom,
  createGroupRoom,
  getRoomMessages,
  sendMessage,
  markRead,
} from '../../controllers/subdomain/chat.controller.js';

const router = express.Router();

// All routes require subdomain context and tenant auth
router.use(validateSubdomain, extractOrganization, authenticateTenant, validateTenantAccess);

router.get('/contacts', listContacts);
router.get('/rooms', getMyRooms);
router.post('/rooms/direct', createDirectRoom);
router.post('/rooms/group', createGroupRoom);
router.get('/rooms/:roomId/messages', getRoomMessages);
router.post('/rooms/:roomId/messages', sendMessage);
router.post('/rooms/:roomId/read', markRead);

export default router;