import express from 'express';
import {
  getConversations,
  getMessages,
  sendMessage,
  createConversation,
  getOrganizationUsers,
  updateUserStatus,
  getUnreadCounts,
  deleteMessage,
  editMessage
} from '../../controllers/tenant/chat.controller.js';
import { authenticateTenant, requireHROrManager } from '../../middleware/tenantAuth.middleware.js';
import { validateSubdomain } from '../../middleware/subdomain.middleware.js';

const router = express.Router();

// All routes require tenant authentication

router.use(validateSubdomain);
router.use(authenticateTenant);


// Get all conversations for the organization
router.get('/conversations', getConversations);

// Get organization users for chat
router.get('/users', getOrganizationUsers);

// Get unread message counts
router.get('/unread-counts', getUnreadCounts);

// Update user online status
router.put('/status', updateUserStatus);

// Create a new conversation
router.post('/conversations', createConversation);

// Get messages for a specific conversation
router.get('/conversations/:conversationId/messages', getMessages);

// Send a message
router.post('/conversations/:conversationId/messages', sendMessage);

// Edit a message
router.put('/messages/:messageId', editMessage);

// Delete a message
router.delete('/messages/:messageId', deleteMessage);

export default router;


