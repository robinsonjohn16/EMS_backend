import mongoose from 'mongoose';

// Helper function to create organization-specific models
const createOrganizationModels = (organizationId) => {
  const collectionSuffix = `-${organizationId}`;
  
  // Message Schema
  const messageSchema = new mongoose.Schema({
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: `Conversation${collectionSuffix}`,
      required: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TenantUser',
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'file', 'system'],
      default: 'text'
    },
    attachments: [{
      filename: String,
      originalName: String,
      mimeType: String,
      size: Number,
      url: String
    }],
    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: {
      type: Date
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: `Message${collectionSuffix}`
    },
    readBy: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TenantUser'
      },
      readAt: {
        type: Date,
        default: Date.now
      }
    }]
  }, {
    timestamps: true,
    collection: `messages${collectionSuffix}`
  });

  // Conversation Schema
  const conversationSchema = new mongoose.Schema({
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    name: {
      type: String,
      trim: true
    },
    type: {
      type: String,
      enum: ['direct', 'group'],
      default: 'direct'
    },
    participants: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TenantUser',
        required: true
      },
      role: {
        type: String,
        enum: ['member', 'admin'],
        default: 'member'
      },
      joinedAt: {
        type: Date,
        default: Date.now
      },
      lastSeen: {
        type: Date,
        default: Date.now
      },
      unreadCount: {
        type: Number,
        default: 0
      }
    }],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: `Message${collectionSuffix}`
    },
    lastMessageAt: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TenantUser'
    },
    avatar: {
      type: String
    },
    description: {
      type: String,
      trim: true
    }
  }, {
    timestamps: true,
    collection: `conversations${collectionSuffix}`
  });

  // User Online Status Schema
  const userStatusSchema = new mongoose.Schema({
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TenantUser',
      required: true,
      unique: true
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    isOnline: {
      type: Boolean,
      default: false
    },
    lastSeen: {
      type: Date,
      default: Date.now
    },
    socketId: {
      type: String
    },
    status: {
      type: String,
      enum: ['online', 'away', 'busy', 'offline'],
      default: 'offline'
    }
  }, {
    timestamps: true,
    collection: `userStatus${collectionSuffix}`
  });

  // Indexes for better performance
  messageSchema.index({ conversationId: 1, createdAt: -1 });
  messageSchema.index({ senderId: 1 });
  conversationSchema.index({ organizationId: 1, lastMessageAt: -1 });
  userStatusSchema.index({ organizationId: 1, isOnline: 1 });

  // Virtual for unread count per user
  conversationSchema.virtual('unreadCountForUser').get(function() {
    return function(userId) {
      const participant = this.participants.find(p => p.userId.toString() === userId.toString());
      return participant ? participant.unreadCount : 0;
    };
  });

  // Methods
  conversationSchema.methods.addParticipant = function(userId, role = 'member') {
    const existingParticipant = this.participants.find(p => p.userId.toString() === userId.toString());
    if (!existingParticipant) {
      this.participants.push({
        userId,
        role,
        joinedAt: new Date(),
        lastSeen: new Date(),
        unreadCount: 0
      });
    }
    return this.save();
  };

  conversationSchema.methods.removeParticipant = function(userId) {
    this.participants = this.participants.filter(p => p.userId.toString() !== userId.toString());
    return this.save();
  };

  conversationSchema.methods.updateLastSeen = function(userId) {
    const participant = this.participants.find(p => p.userId.toString() === userId.toString());
    if (participant) {
      participant.lastSeen = new Date();
      participant.unreadCount = 0;
    }
    return this.save();
  };

  conversationSchema.methods.incrementUnreadCount = function(excludeUserId) {
    this.participants.forEach(participant => {
      if (participant.userId.toString() !== excludeUserId.toString()) {
        participant.unreadCount += 1;
      }
    });
    return this.save();
  };

  // Static methods
  conversationSchema.statics.findByOrganization = function(organizationId) {
    return this.find({ organizationId, isActive: true })
      .populate('participants.userId', 'firstName lastName email avatar role')
      .populate('lastMessage')
      .populate('createdBy', 'firstName lastName')
      .sort({ lastMessageAt: -1 });
  };

  conversationSchema.statics.findDirectConversation = function(userId1, userId2, organizationId) {
    return this.findOne({
      organizationId,
      type: 'direct',
      participants: {
        $all: [
          { $elemMatch: { userId: userId1 } },
          { $elemMatch: { userId: userId2 } }
        ]
      }
    });
  };

  return {
    Message: mongoose.model(`Message${collectionSuffix}`, messageSchema),
    Conversation: mongoose.model(`Conversation${collectionSuffix}`, conversationSchema),
    UserStatus: mongoose.model(`UserStatus${collectionSuffix}`, userStatusSchema)
  };
};

// Default models (for backward compatibility)
const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantUser',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'system'],
    default: 'text'
  },
  attachments: [{
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    url: String
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TenantUser'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

const conversationSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  name: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['direct', 'group'],
    default: 'direct'
  },
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TenantUser',
      required: true
    },
    role: {
      type: String,
      enum: ['member', 'admin'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    lastSeen: {
      type: Date,
      default: Date.now
    },
    unreadCount: {
      type: Number,
      default: 0
    }
  }],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantUser'
  },
  avatar: {
    type: String
  },
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

const userStatusSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantUser',
    required: true,
    unique: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  socketId: {
    type: String
  },
  status: {
    type: String,
    enum: ['online', 'away', 'busy', 'offline'],
    default: 'offline'
  }
}, {
  timestamps: true
});

// Indexes for better performance
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });
conversationSchema.index({ organizationId: 1, lastMessageAt: -1 });
userStatusSchema.index({ organizationId: 1, isOnline: 1 });

// Virtual for unread count per user
conversationSchema.virtual('unreadCountForUser').get(function() {
  return function(userId) {
    const participant = this.participants.find(p => p.userId.toString() === userId.toString());
    return participant ? participant.unreadCount : 0;
  };
});

// Methods
conversationSchema.methods.addParticipant = function(userId, role = 'member') {
  const existingParticipant = this.participants.find(p => p.userId.toString() === userId.toString());
  if (!existingParticipant) {
    this.participants.push({
      userId,
      role,
      joinedAt: new Date(),
      lastSeen: new Date(),
      unreadCount: 0
    });
  }
  return this.save();
};

conversationSchema.methods.removeParticipant = function(userId) {
  this.participants = this.participants.filter(p => p.userId.toString() !== userId.toString());
  return this.save();
};

conversationSchema.methods.updateLastSeen = function(userId) {
  const participant = this.participants.find(p => p.userId.toString() === userId.toString());
  if (participant) {
    participant.lastSeen = new Date();
    participant.unreadCount = 0;
  }
  return this.save();
};

conversationSchema.methods.incrementUnreadCount = function(excludeUserId) {
  this.participants.forEach(participant => {
    if (participant.userId.toString() !== excludeUserId.toString()) {
      participant.unreadCount += 1;
    }
  });
  return this.save();
};

// Static methods
conversationSchema.statics.findByOrganization = function(organizationId) {
  return this.find({ organizationId, isActive: true })
    .populate('participants.userId', 'firstName lastName email avatar role')
    .populate('lastMessage')
    .populate('createdBy', 'firstName lastName')
    .sort({ lastMessageAt: -1 });
};

conversationSchema.statics.findDirectConversation = function(userId1, userId2, organizationId) {
  return this.findOne({
    organizationId,
    type: 'direct',
    participants: {
      $all: [
        { $elemMatch: { userId: userId1 } },
        { $elemMatch: { userId: userId2 } }
      ]
    }
  });
};

// Export models
export const Message = mongoose.model('Message', messageSchema);
export const Conversation = mongoose.model('Conversation', conversationSchema);
export const UserStatus = mongoose.model('UserStatus', userStatusSchema);

// Export the helper function
export { createOrganizationModels };