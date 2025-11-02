import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { createOrganizationModels } from '../models/tenant/chat.model.js';
import TenantUser from '../models/tenant/auth.model.js';

// Store active connections
const activeConnections = new Map(); // userId -> socketId
const organizationSockets = new Map(); // organizationId -> Set of socketIds
const organizationModels = new Map(); // organizationId -> models

export const initializeSocketIO = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || ["http://localhost:5173", "http://localhost:3000"],
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true
    },
    path: '/socket.io', // Explicitly set the path
    serveClient: false,
    pingTimeout: 60000,
    pingInterval: 25000
  });
  
  console.log('Socket.IO server initialized with path: /socket.io');

  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if this is a tenant user token
      if (decoded.type !== 'tenant') {
        return next(new Error('Authentication error: Invalid token type'));
      }
      
      // Get user from database to ensure they still exist and are active
      const user = await TenantUser.findById(decoded._id).populate('organization');
      
      if (!user || !user.isActive) {
        return next(new Error('Authentication error: User not found or inactive'));
      }

      socket.userId = user._id.toString();
      socket.organizationId = user.organization._id.toString();
      socket.user = user;
      
      // Get or create organization-specific models
      if (!organizationModels.has(socket.organizationId)) {
        organizationModels.set(socket.organizationId, createOrganizationModels(socket.organizationId));
      }
      socket.models = organizationModels.get(socket.organizationId);
      
      next();
    } catch (error) {
      console.error('Socket.IO authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    const organizationId = socket.organizationId;
    const user = socket.user;

    console.log(`User ${user.firstName} ${user.lastName} connected with socket ${socket.id}`);

    // Store connection
    activeConnections.set(userId, socket.id);
    
    if (!organizationSockets.has(organizationId)) {
      organizationSockets.set(organizationId, new Set());
    }
    organizationSockets.get(organizationId).add(socket.id);

    // Update user online status
    const { UserStatus } = socket.models;
    await UserStatus.findOneAndUpdate(
      { userId, organizationId },
      {
        isOnline: true,
        lastSeen: new Date(),
        status: 'online',
        socketId: socket.id
      },
      { upsert: true }
    );

    // Join user to their organization room
    socket.join(`org_${organizationId}`);

    // Notify organization about user coming online
    socket.to(`org_${organizationId}`).emit('user_status_changed', {
      userId,
      isOnline: true,
      status: 'online',
      lastSeen: new Date(),
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar
      }
    });

    // Handle data requests
    socket.on('request_conversations', async () => {
      try {
        const { Conversation } = socket.models;
        const conversations = await Conversation.findByOrganization(organizationId)
          .then(convs => convs.filter(conv => 
            conv.participants.some(p => p.userId._id.toString() === userId)
          ));

        // Add unread count for each conversation
        const conversationsWithUnread = conversations.map(conv => {
          const participant = conv.participants.find(p => p.userId._id.toString() === userId);
          return {
            ...conv.toObject(),
            unreadCount: participant ? participant.unreadCount : 0
          };
        });

        socket.emit('conversations_data', { conversations: conversationsWithUnread });
      } catch (error) {
        console.error('Error fetching conversations:', error);
        socket.emit('error', { message: 'Failed to fetch conversations' });
      }
    });

    socket.on('request_organization_users', async () => {
      try {
        const users = await TenantUser.find({
          organization: organizationId,
          isActive: true
        })
          .select('firstName lastName email avatar role department position')
          .lean();

        // Get online status for all users
        const { UserStatus } = socket.models;
        const userStatuses = await UserStatus.find({
          organizationId: organizationId
        }).lean();

        // Create a map of user statuses
        const statusMap = {};
        userStatuses.forEach(status => {
          statusMap[status.userId.toString()] = {
            isOnline: status.isOnline,
            lastSeen: status.lastSeen,
            status: status.status
          };
        });

        // Combine user data with status
        const usersWithStatus = users.map(user => ({
          ...user,
          isOnline: statusMap[user._id.toString()]?.isOnline || false,
          lastSeen: statusMap[user._id.toString()]?.lastSeen || null,
          status: statusMap[user._id.toString()]?.status || 'offline'
        }));

        // Remove current user from the list
        const otherUsers = usersWithStatus.filter(user => 
          user._id.toString() !== userId
        );

        socket.emit('organization_users_data', { users: otherUsers });
      } catch (error) {
        console.error('Error fetching organization users:', error);
        socket.emit('error', { message: 'Failed to fetch organization users' });
      }
    });

    socket.on('request_unread_counts', async () => {
      try {
        const { Conversation } = socket.models;
        const conversations = await Conversation.find({
          organizationId: organizationId,
          'participants.userId': userId,
          isActive: true
        });

        let totalUnread = 0;
        conversations.forEach(conv => {
          const participant = conv.participants.find(p => 
            p.userId.toString() === userId
          );
          const unreadCount = participant ? participant.unreadCount : 0;
          totalUnread += unreadCount;
        });

        socket.emit('unread_counts_data', { totalUnread });
      } catch (error) {
        console.error('Error fetching unread counts:', error);
        socket.emit('error', { message: 'Failed to fetch unread counts' });
      }
    });

    socket.on('request_messages', async (data) => {
      try {
        const { conversationId, page = 1, limit = 50 } = data;
        const { Conversation, Message } = socket.models;

        // Check if user is participant of the conversation
        const conversation = await Conversation.findById(conversationId)
          .populate('participants.userId', 'firstName lastName email avatar');
        
        if (!conversation) {
          socket.emit('error', { message: 'Conversation not found' });
          return;
        }

        const isParticipant = conversation.participants.some(p => 
          p.userId._id.toString() === userId
        );

        if (!isParticipant) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        // Get messages with pagination
        const skip = (page - 1) * limit;
        const messages = await Message.find({ 
          conversationId, 
          isDeleted: false 
        })
          .populate('senderId', 'firstName lastName email avatar')
          .populate('replyTo')
          .sort({ createdAt: -1 })
          .limit(parseInt(limit))
          .skip(skip);

        // Mark messages as read for this user
        await Message.updateMany(
          { 
            conversationId, 
            'readBy.userId': { $ne: userId }
          },
          { 
            $push: { 
              readBy: { 
                userId, 
                readAt: new Date() 
              } 
            } 
          }
        );

        // Update conversation last seen and reset unread count
        await conversation.updateLastSeen(userId);

        socket.emit('messages_data', {
          conversationId,
          messages: messages.reverse(),
          conversation,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: await Message.countDocuments({ conversationId, isDeleted: false })
          }
        });
      } catch (error) {
        console.error('Error fetching messages:', error);
        socket.emit('error', { message: 'Failed to fetch messages' });
      }
    });

    // Handle joining conversation rooms
    socket.on('join_conversation', async (conversationId) => {
      try {
        const { Conversation } = socket.models;
        // Verify user is participant of the conversation
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          socket.emit('error', { message: 'Conversation not found' });
          return;
        }

        const isParticipant = conversation.participants.some(p => 
          p.userId.toString() === userId
        );

        if (!isParticipant) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        socket.join(`conversation_${conversationId}`);
        socket.emit('joined_conversation', { conversationId });

        // Update last seen for this conversation
        await conversation.updateLastSeen(userId);
      } catch (error) {
        console.error('Error joining conversation:', error);
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    // Handle leaving conversation rooms
    socket.on('leave_conversation', (conversationId) => {
      socket.leave(`conversation_${conversationId}`);
      socket.emit('left_conversation', { conversationId });
    });

    // Handle sending messages
    socket.on('send_message', async (data) => {
      try {
        const { conversationId, content, messageType = 'text', replyTo } = data;
        const { Conversation, Message } = socket.models;

        // Verify user is participant of the conversation
        const conversation = await Conversation.findById(conversationId)
          .populate('participants.userId', 'firstName lastName email avatar');
        
        if (!conversation) {
          socket.emit('error', { message: 'Conversation not found' });
          return;
        }

        const isParticipant = conversation.participants.some(p => 
          p.userId._id.toString() === userId
        );

        if (!isParticipant) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        // Create message
        const message = new Message({
          conversationId,
          senderId: userId,
          content,
          messageType,
          replyTo
        });

        await message.save();
        await message.populate('senderId', 'firstName lastName email avatar');
        await message.populate('replyTo');

        // Update conversation
        conversation.lastMessage = message._id;
        conversation.lastMessageAt = new Date();
        await conversation.incrementUnreadCount(userId);
        await conversation.save();

        // Emit message to all participants in the conversation
        io.to(`conversation_${conversationId}`).emit('new_message', {
          message,
          conversation: {
            _id: conversation._id,
            lastMessage: message._id,
            lastMessageAt: conversation.lastMessageAt
          }
        });

        // Emit conversation update to organization
        io.to(`org_${organizationId}`).emit('conversation_updated', {
          conversationId,
          lastMessage: message,
          lastMessageAt: conversation.lastMessageAt
        });

      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      const { conversationId } = data;
      socket.to(`conversation_${conversationId}`).emit('user_typing', {
        userId,
        user: {
          firstName: user.firstName,
          lastName: user.lastName
        },
        conversationId
      });
    });

    socket.on('typing_stop', (data) => {
      const { conversationId } = data;
      socket.to(`conversation_${conversationId}`).emit('user_stopped_typing', {
        userId,
        conversationId
      });
    });

    // Handle message read status
    socket.on('mark_messages_read', async (data) => {
      try {
        const { conversationId } = data;
        const { Message, Conversation } = socket.models;
        
        // Mark all messages in conversation as read for this user
        await Message.updateMany(
          { 
            conversationId, 
            'readBy.userId': { $ne: userId }
          },
          { 
            $push: { 
              readBy: { 
                userId, 
                readAt: new Date() 
              } 
            } 
          }
        );

        // Update conversation unread count
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          await conversation.updateLastSeen(userId);
          
          // Notify other participants that messages were read
          socket.to(`conversation_${conversationId}`).emit('messages_read', {
            userId,
            conversationId,
            readAt: new Date()
          });
        }
      } catch (error) {
        console.error('Error marking messages as read:', error);
        socket.emit('error', { message: 'Failed to mark messages as read' });
      }
    });

    // Handle status updates
    socket.on('update_status', async (data) => {
      try {
        const { status } = data;
        const { UserStatus } = socket.models;
        
        await UserStatus.findOneAndUpdate(
          { userId, organizationId },
          {
            isOnline: status !== 'offline',
            lastSeen: new Date(),
            status
          }
        );

        // Notify organization about status change
        socket.to(`org_${organizationId}`).emit('user_status_changed', {
          userId,
          isOnline: status !== 'offline',
          status,
          lastSeen: new Date(),
          user: {
            firstName: user.firstName,
            lastName: user.lastName,
            avatar: user.avatar
          }
        });
      } catch (error) {
        console.error('Error updating status:', error);
        socket.emit('error', { message: 'Failed to update status' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log(`User ${user.firstName} ${user.lastName} disconnected`);

      // Remove from active connections
      activeConnections.delete(userId);
      const orgSockets = organizationSockets.get(organizationId);
      if (orgSockets) {
        orgSockets.delete(socket.id);
        if (orgSockets.size === 0) {
          organizationSockets.delete(organizationId);
        }
      }

      // Update user offline status
      const { UserStatus } = socket.models;
      await UserStatus.findOneAndUpdate(
        { userId, organizationId },
        {
          isOnline: false,
          lastSeen: new Date(),
          status: 'offline',
          socketId: null
        }
      );

      // Notify organization about user going offline
      socket.to(`org_${organizationId}`).emit('user_status_changed', {
        userId,
        isOnline: false,
        status: 'offline',
        lastSeen: new Date(),
        user: {
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar
        }
      });
    });
  });

  return io;
};

export default initializeSocketIO;
