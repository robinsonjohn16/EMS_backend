import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Organization from '../models/organization.model.js';
import { getOrgChatModel, getOrgMessageModel } from '../utils/orgCollections.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected for message migration'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Migration function
const migrateEmbeddedMessages = async () => {
  try {
    console.log('Starting embedded messages migration...');

    // Get all organizations
    const organizations = await Organization.find({});
    console.log(`Found ${organizations.length} organizations to migrate`);

    let totalChatsProcessed = 0;
    let totalMessagesCreated = 0;

    for (const organization of organizations) {
      console.log(`\nProcessing organization: ${organization.name} (${organization.slug})`);
      
      // Get organization-specific models
      const Chat = getOrgChatModel(organization._id);
      const Message = getOrgMessageModel(organization._id);

      // Find all chats with embedded messages
      const chats = await Chat.find({ 
        messages: { $exists: true, $not: { $size: 0 } } 
      });

      console.log(`Found ${chats.length} chats with embedded messages`);

      for (const chat of chats) {
        if (!chat.messages || chat.messages.length === 0) {
          continue;
        }

        console.log(`Migrating ${chat.messages.length} messages from chat: ${chat._id}`);

        // Create separate Message documents
        const messagesToCreate = chat.messages.map(embeddedMessage => ({
          organizationId: organization._id,
          chatId: chat._id,
          senderId: embeddedMessage.senderId,
          content: embeddedMessage.content,
          type: embeddedMessage.type || 'text',
          status: embeddedMessage.status || 'delivered',
          seenBy: embeddedMessage.seenBy || [],
          timestamp: embeddedMessage.timestamp || embeddedMessage.createdAt || new Date(),
          createdAt: embeddedMessage.createdAt || embeddedMessage.timestamp || new Date(),
          updatedAt: embeddedMessage.updatedAt || embeddedMessage.timestamp || new Date(),
          // Handle media files if they exist
          ...(embeddedMessage.fileUrl && { fileUrl: embeddedMessage.fileUrl }),
          ...(embeddedMessage.fileName && { fileName: embeddedMessage.fileName }),
          ...(embeddedMessage.fileSize && { fileSize: embeddedMessage.fileSize }),
          ...(embeddedMessage.mimeType && { mimeType: embeddedMessage.mimeType })
        }));

        // Insert messages in batches to avoid memory issues
        const batchSize = 100;
        const createdMessages = [];
        
        for (let i = 0; i < messagesToCreate.length; i += batchSize) {
          const batch = messagesToCreate.slice(i, i + batchSize);
          const batchResult = await Message.insertMany(batch, { ordered: false });
          createdMessages.push(...batchResult);
        }

        // Update chat document with new metadata
        const lastMessage = createdMessages[createdMessages.length - 1];
        const updateData = {
          lastMessageId: lastMessage._id,
          lastMessageAt: lastMessage.timestamp,
          messageCount: createdMessages.length,
          // Remove the embedded messages array
          $unset: { messages: "" }
        };

        await Chat.findByIdAndUpdate(chat._id, updateData);

        totalMessagesCreated += createdMessages.length;
        console.log(`✓ Migrated ${createdMessages.length} messages for chat ${chat._id}`);
      }

      totalChatsProcessed += chats.length;
      console.log(`Completed migration for organization: ${organization.name}`);
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Organizations processed: ${organizations.length}`);
    console.log(`Chats processed: ${totalChatsProcessed}`);
    console.log(`Messages created: ${totalMessagesCreated}`);
    console.log('Migration completed successfully!');

    // Verify migration
    console.log('\n=== Verification ===');
    for (const organization of organizations) {
      const Chat = getOrgChatModel(organization._id);
      const Message = getOrgMessageModel(organization._id);
      
      const chatCount = await Chat.countDocuments({});
      const messageCount = await Message.countDocuments({});
      const chatsWithEmbeddedMessages = await Chat.countDocuments({ 
        messages: { $exists: true, $not: { $size: 0 } } 
      });
      
      console.log(`${organization.name}:`);
      console.log(`  - Chats: ${chatCount}`);
      console.log(`  - Messages: ${messageCount}`);
      console.log(`  - Chats with embedded messages remaining: ${chatsWithEmbeddedMessages}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  }
};

// Run the migration
migrateEmbeddedMessages();