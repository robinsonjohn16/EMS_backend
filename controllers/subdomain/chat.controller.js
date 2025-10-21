import ChatRoom from '../../models/tenant/chatRoom.model.js';
import ChatMessage from '../../models/tenant/chatMessage.model.js';
import TenantUser from '../../models/tenant/auth.model.js';
import { successResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/errorClasses.js';

// List contacts in the organization for chat (all active tenant users)
export const listContacts = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const userId = req.user?._id;
    if (!organizationId || !userId) throw new ApiError('Organization or user context missing', 400);

    const users = await TenantUser.find({ organization: organizationId, isActive: true })
      .select('_id firstName lastName username email role department position')
      .lean();
    const contacts = users.filter(u => String(u._id) !== String(userId));
    return successResponse(res, 200, 'Contacts', { contacts });
  } catch (err) { next(err); }
};

// Get rooms where current user is a participant
export const getMyRooms = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const userId = req.user?._id;
    if (!organizationId || !userId) throw new ApiError('Organization or user context missing', 400);

    const rooms = await ChatRoom.find({ organizationId, 'participants.userId': userId })
      .lean();
    return successResponse(res, 200, 'Rooms', { rooms });
  } catch (err) { next(err); }
};

// Create or fetch direct room between current user and other user
export const createDirectRoom = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const userId = req.user?._id;
    const { otherUserId } = req.body || {};
    if (!organizationId || !userId) throw new ApiError('Organization or user context missing', 400);
    if (!otherUserId) throw new ApiError('otherUserId is required', 422);

    const other = await TenantUser.findOne({ _id: otherUserId, organization: organizationId, isActive: true }).lean();
    if (!other) throw new ApiError('User not found in this organization', 404);

    const directKey = [String(userId), String(otherUserId)].sort().join(':');
    let room = await ChatRoom.findOne({ organizationId, type: 'direct', directKey }).lean();
    if (!room) {
      room = await ChatRoom.create({
        organizationId,
        type: 'direct',
        directKey,
        participants: [
          { userId },
          { userId: otherUserId },
        ],
        createdBy: userId,
      });
    }
    return successResponse(res, 201, 'Direct room', room);
  } catch (err) { next(err); }
};

// Create a group room
export const createGroupRoom = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const userId = req.user?._id;
    const { name, participantUserIds } = req.body || {};
    if (!organizationId || !userId) throw new ApiError('Organization or user context missing', 400);
    if (!name || !Array.isArray(participantUserIds) || participantUserIds.length === 0) {
      throw new ApiError('name and participantUserIds are required', 422);
    }

    const uniqIds = Array.from(new Set(participantUserIds.map(String)));
    // Ensure all participants belong to org
    const count = await TenantUser.countDocuments({ _id: { $in: uniqIds }, organization: organizationId, isActive: true });
    if (count !== uniqIds.length) throw new ApiError('One or more users not found in org', 400);

    const room = await ChatRoom.create({
      organizationId,
      type: 'group',
      name,
      participants: uniqIds.map(id => ({ userId: id })),
      createdBy: userId,
    });

    return successResponse(res, 201, 'Group room created', room);
  } catch (err) { next(err); }
};

// Get messages in a room with pagination
export const getRoomMessages = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const userId = req.user?._id;
    const { roomId } = req.params;
    const { before, limit = 50 } = req.query;
    if (!organizationId || !userId) throw new ApiError('Organization or user context missing', 400);

    const room = await ChatRoom.findOne({ _id: roomId, organizationId, 'participants.userId': userId }).lean();
    if (!room) throw new ApiError('Room not found or access denied', 404);

    const query = { organizationId, roomId };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await ChatMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .lean();

    return successResponse(res, 200, 'Messages', { messages });
  } catch (err) { next(err); }
};

// Send message (REST fallback; realtime is via socket)
export const sendMessage = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const userId = req.user?._id;
    const { roomId } = req.params;
    const { content, contentType = 'text', attachments = [] } = req.body || {};
    if (!organizationId || !userId) throw new ApiError('Organization or user context missing', 400);

    const room = await ChatRoom.findOne({ _id: roomId, organizationId, 'participants.userId': userId }).lean();
    if (!room) throw new ApiError('Room not found or access denied', 404);

    const msg = await ChatMessage.create({ organizationId, roomId, senderUserId: userId, content, contentType, attachments });
    // Emit realtime event if io is available
    const io = req.app.get('io');
    if (io) io.to(String(roomId)).emit('chat:message:new', msg.toObject ? msg.toObject() : msg);

    return successResponse(res, 201, 'Message sent', msg);
  } catch (err) { next(err); }
};

// Mark messages as read up to a timestamp
export const markRead = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const userId = req.user?._id;
    const { roomId } = req.params;
    const { timestamp } = req.body || {};
    if (!organizationId || !userId) throw new ApiError('Organization or user context missing', 400);

    const room = await ChatRoom.findOne({ _id: roomId, organizationId, 'participants.userId': userId });
    if (!room) throw new ApiError('Room not found or access denied', 404);

    const ts = timestamp ? new Date(timestamp) : new Date();
    const part = room.participants.find(p => String(p.userId) === String(userId));
    if (part) {
      part.lastReadAt = ts;
      await room.save();
    }
    return successResponse(res, 200, 'Read status updated', { roomId, lastReadAt: ts });
  } catch (err) { next(err); }
};