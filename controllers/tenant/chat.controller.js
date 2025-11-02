import { Message, Conversation, UserStatus } from '../../models/tenant/chat.model.js';
import { ApiError } from '../../utils/errorClasses.js';
import { successResponse } from '../../utils/apiResponse.js';
import TenantUser from '../../models/tenant/auth.model.js';

// Get all conversations for an organization
export const getConversations = async (req, res, next) => {
  try {
    const organization = req.organization;
    const userId = req.user._id;

    const conversations = await Conversation.findByOrganization(organization._id)
      .then(convs => convs.filter(conv => 
        conv.participants.some(p => p.userId._id.toString() === userId.toString())
      ));

    // Add unread count for each conversation
    const conversationsWithUnread = conversations.map(conv => {
      const participant = conv.participants.find(p => p.userId._id.toString() === userId.toString());
      return {
        ...conv.toObject(),
        unreadCount: participant ? participant.unreadCount : 0
      };
    });

    return successResponse(res, 200, 'Conversations retrieved successfully', {
      conversations: conversationsWithUnread
    });
  } catch (error) {
    next(error);
  }
};

// Get messages for a specific conversation
export const getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user._id;

    // Check if user is participant of the conversation
    const conversation = await Conversation.findById(conversationId)
      .populate('participants.userId', 'firstName lastName email avatar');
    
    if (!conversation) {
      throw new ApiError('Conversation not found', 404);
    }

    const isParticipant = conversation.participants.some(p => 
      p.userId._id.toString() === userId.toString()
    );

    if (!isParticipant) {
      throw new ApiError('Access denied', 403);
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

    return successResponse(res, 200, 'Messages retrieved successfully', {
      messages: messages.reverse(), // Reverse to show oldest first
      conversation,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: await Message.countDocuments({ conversationId, isDeleted: false })
      }
    });
  } catch (error) {
    next(error);
  }
};

// Send a message
export const sendMessage = async (req, res, next) => {
  try {
    const { conversationId, content, messageType = 'text', replyTo } = req.body;
    const userId = req.user._id;
    const organization = req.organization;

    // Validate conversation exists and user is participant
    const conversation = await Conversation.findById(conversationId)
      .populate('participants.userId', 'firstName lastName email avatar');
    
    if (!conversation) {
      throw new ApiError('Conversation not found', 404);
    }

    const isParticipant = conversation.participants.some(p => 
      p.userId._id.toString() === userId.toString()
    );

    if (!isParticipant) {
      throw new ApiError('Access denied', 403);
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

    // Update conversation last message
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = new Date();
    
    // Increment unread count for all participants except sender
    await conversation.incrementUnreadCount(userId);
    await conversation.save();

    return successResponse(res, 201, 'Message sent successfully', {
      message
    });
  } catch (error) {
    next(error);
  }
};

// Create a new conversation (group or direct)
export const createConversation = async (req, res, next) => {
  try {
    const { name, type = 'direct', participantIds, description } = req.body;
    const userId = req.user._id;
    const organization = req.organization;

    // Validate participants
    if (!participantIds || participantIds.length === 0) {
      throw new ApiError('At least one participant is required', 400);
    }

    // Add creator to participants if not already included
    const allParticipants = [...new Set([userId.toString(), ...participantIds])];

    // For direct conversation, check if it already exists
    if (type === 'direct' && participantIds.length === 1) {
      const existingConversation = await Conversation.findDirectConversation(
        userId, 
        participantIds[0], 
        organization._id
      );
      
      if (existingConversation) {
        return successResponse(res, 200, 'Direct conversation already exists', {
          conversation: existingConversation
        });
      }
    }

    // Create conversation
    const conversation = new Conversation({
      organizationId: organization._id,
      name: type === 'group' ? name : null,
      type,
      description,
      createdBy: userId,
      participants: allParticipants.map(pid => ({
        userId: pid,
        role: pid === userId.toString() ? 'admin' : 'member',
        joinedAt: new Date(),
        lastSeen: new Date(),
        unreadCount: 0
      }))
    });

    await conversation.save();
    await conversation.populate('participants.userId', 'firstName lastName email avatar role');
    await conversation.populate('createdBy', 'firstName lastName');

    return successResponse(res, 201, 'Conversation created successfully', {
      conversation
    });
  } catch (error) {
    next(error);
  }
};

// Get organization users for chat
export const getOrganizationUsers = async (req, res, next) => {
  try {
    const organization = req.organization;
    const userId = req.user._id;

    // Get all users in the organization with their online status
    const users = await TenantUser.find({
      organization: organization._id,
      isActive: true
    })
      .select('firstName lastName email avatar role department position')
      .lean();

    // Get online status for all users
    const userStatuses = await UserStatus.find({
      organizationId: organization._id
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
      user._id.toString() !== userId.toString()
    );

    return successResponse(res, 200, 'Organization users retrieved successfully', {
      users: otherUsers
    });
  } catch (error) {
    next(error);
  }
};

// Update user online status
export const updateUserStatus = async (req, res, next) => {
  try {
    const { status = 'online' } = req.body;
    const userId = req.user._id;
    const organization = req.organization;

    const userStatus = await UserStatus.findOneAndUpdate(
      { userId, organizationId: organization._id },
      {
        isOnline: status !== 'offline',
        lastSeen: new Date(),
        status
      },
      { upsert: true, new: true }
    );

    return successResponse(res, 200, 'User status updated successfully', {
      userStatus
    });
  } catch (error) {
    next(error);
  }
};

// Get unread message counts
export const getUnreadCounts = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const organization = req.organization;

    const conversations = await Conversation.find({
      organizationId: organization._id,
      'participants.userId': userId,
      isActive: true
    });

    let totalUnread = 0;
    const conversationUnreadCounts = {};

    conversations.forEach(conv => {
      const participant = conv.participants.find(p => 
        p.userId.toString() === userId.toString()
      );
      const unreadCount = participant ? participant.unreadCount : 0;
      totalUnread += unreadCount;
      conversationUnreadCounts[conv._id.toString()] = unreadCount;
    });

    return successResponse(res, 200, 'Unread counts retrieved successfully', {
      totalUnread,
      conversationUnreadCounts
    });
  } catch (error) {
    next(error);
  }
};

// Delete a message
export const deleteMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      throw new ApiError('Message not found', 404);
    }

    // Check if user is the sender
    if (message.senderId.toString() !== userId.toString()) {
      throw new ApiError('You can only delete your own messages', 403);
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();

    return successResponse(res, 200, 'Message deleted successfully');
  } catch (error) {
    next(error);
  }
};

// Edit a message
export const editMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      throw new ApiError('Message not found', 404);
    }

    // Check if user is the sender
    if (message.senderId.toString() !== userId.toString()) {
      throw new ApiError('You can only edit your own messages', 403);
    }

    message.content = content;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    await message.populate('senderId', 'firstName lastName email avatar');

    return successResponse(res, 200, 'Message edited successfully', {
      message
    });
  } catch (error) {
    next(error);
  }
};


