import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import Organization from '../models/organization.model.js';
import TenantUser from '../models/tenant/auth.model.js';
import ChatRoom from '../models/tenant/chatRoom.model.js';
import ChatMessage from '../models/tenant/chatMessage.model.js';

function extractSubdomainFromOrigin(origin) {
  try {
    if (!origin) return null;
    const host = origin.split('//')[1];
    if (!host) return null;
    const hostParts = host.split('.');
    if (hostParts.length >= 3) {
      return hostParts[0];
    } else if (hostParts.length === 2 && hostParts[1].includes('localhost')) {
      return hostParts[0];
    } else if (host.includes('localhost') && hostParts.length === 1) {
      return null; // dev without subdomain must be provided via auth payload
    }
    return null;
  } catch {
    return null;
  }
}

export function initSocketServer(httpServer, corsOrigins = []) {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST']
    }
  });

  // Presence map per organization: { orgId: Set(userIds) }
  const presence = new Map();

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      const providedSubdomain = socket.handshake.auth?.subdomain || socket.handshake.query?.subdomain;
      const originSubdomain = extractSubdomainFromOrigin(socket.handshake.headers?.origin);
      const subdomain = providedSubdomain || originSubdomain;
      if (!token) return next(new Error('Access token is required'));
      if (!subdomain) return next(new Error('Subdomain is required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.type !== 'tenant') return next(new Error('Invalid token type'));

      const organization = await Organization.findBySlug(subdomain);
      if (!organization || !organization.active) return next(new Error('Organization not found or inactive'));

      const user = await TenantUser.findById(decoded._id).select('_id organization isActive role username');
      if (!user || !user.isActive) return next(new Error('User not found or inactive'));
      if (String(user.organization) !== String(organization._id)) return next(new Error('User not in this organization'));

      socket.data.userId = String(user._id);
      socket.data.organizationId = String(organization._id);
      next();
    } catch (err) {
      next(err);
    }
  });

  io.on('connection', async (socket) => {
    const { userId, organizationId } = socket.data;

    // Mark presence
    if (!presence.has(organizationId)) presence.set(organizationId, new Set());
    presence.get(organizationId).add(userId);

    // Auto-join all rooms the user participates in
    try {
      const rooms = await ChatRoom.find({ organizationId, 'participants.userId': userId }).select('_id').lean();
      rooms.forEach(r => socket.join(r._id.toString()));
      io.to(rooms.map(r => r._id.toString())).emit('presence:update', { userId, status: 'online' });
    } catch (e) {
      // ignore
    }

    // List rooms
    socket.on('chat:rooms:list', async (cb) => {
      try {
        const rooms = await ChatRoom.find({ organizationId, 'participants.userId': userId }).lean();
        cb?.({ ok: true, rooms });
      } catch (err) { cb?.({ ok: false, error: err.message }); }
    });

    // Create direct room
    socket.on('chat:room:create:direct', async ({ otherUserId }, cb) => {
      try {
        const other = await TenantUser.findOne({ _id: otherUserId, organization: organizationId, isActive: true }).lean();
        if (!other) throw new Error('User not found in this organization');
        const directKey = [String(userId), String(otherUserId)].sort().join(':');
        let room = await ChatRoom.findOne({ organizationId, type: 'direct', directKey }).lean();
        if (!room) {
          room = await ChatRoom.create({ organizationId, type: 'direct', directKey, participants: [{ userId }, { userId: otherUserId }], createdBy: userId });
        }
        socket.join(room._id.toString());
        cb?.({ ok: true, room });
      } catch (err) { cb?.({ ok: false, error: err.message }); }
    });

    // Send message
    socket.on('chat:message:send', async ({ roomId, content, contentType = 'text', attachments = [] }, cb) => {
      try {
        const room = await ChatRoom.findOne({ _id: roomId, organizationId, 'participants.userId': userId }).lean();
        if (!room) throw new Error('Room not found or access denied');
        const msg = await ChatMessage.create({ organizationId, roomId, senderUserId: userId, content, contentType, attachments });
        io.to(roomId.toString()).emit('chat:message:new', msg.toObject ? msg.toObject() : msg);
        cb?.({ ok: true, message: msg });
      } catch (err) { cb?.({ ok: false, error: err.message }); }
    });

    // Typing indicator
    socket.on('chat:typing', ({ roomId, isTyping }) => {
      io.to(roomId.toString()).emit('chat:typing', { roomId, userId, isTyping: !!isTyping });
    });

    // Read receipts
    socket.on('chat:read', async ({ roomId, timestamp }, cb) => {
      try {
        const room = await ChatRoom.findOne({ _id: roomId, organizationId, 'participants.userId': userId });
        if (!room) throw new Error('Room not found or access denied');
        const ts = timestamp ? new Date(timestamp) : new Date();
        const part = room.participants.find(p => String(p.userId) === String(userId));
        if (part) {
          part.lastReadAt = ts;
          await room.save();
        }
        io.to(roomId.toString()).emit('chat:read', { roomId, userId, timestamp: ts });
        cb?.({ ok: true, lastReadAt: ts });
      } catch (err) { cb?.({ ok: false, error: err.message }); }
    });

    // Fetch messages with pagination
    socket.on('chat:messages:list', async ({ roomId, before, limit = 50 }, cb) => {
      try {
        const room = await ChatRoom.findOne({ _id: roomId, organizationId, 'participants.userId': userId }).lean();
        if (!room) throw new Error('Room not found or access denied');
        const query = { organizationId, roomId };
        if (before) query.createdAt = { $lt: new Date(before) };
        const messages = await ChatMessage.find(query).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 50, 200)).lean();
        cb?.({ ok: true, messages });
      } catch (err) { cb?.({ ok: false, error: err.message }); }
    });

    socket.on('disconnect', async () => {
      const set = presence.get(organizationId);
      if (set) {
        set.delete(userId);
      }
      // Broadcast offline presence to all rooms the user was in
      try {
        const rooms = await ChatRoom.find({ organizationId, 'participants.userId': userId }).select('_id').lean();
        io.to(rooms.map(r => r._id.toString())).emit('presence:update', { userId, status: 'offline' });
      } catch {}
    });
  });

  return io;
}