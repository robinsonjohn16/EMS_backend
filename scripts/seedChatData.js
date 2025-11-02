import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Organization from '../models/organization.model.js';
import TenantUser from '../models/tenant/auth.model.js';
import { getOrgChatModel } from '../utils/orgCollections.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected for chat seeding'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Seed function
const seedChatData = async () => {
  try {
    console.log('Starting chat data seeding...');

    // Find existing organization (assuming demo-company exists from previous seed)
    const organization = await Organization.findOne({ slug: 'demo-company' });
    if (!organization) {
      console.error('Organization not found. Please run seedEmployeeData.js first.');
      process.exit(1);
    }

    // Find existing users
    const users = await TenantUser.find({ organization: organization._id });
    if (users.length < 2) {
      console.error('Not enough users found. Please run seedEmployeeData.js first.');
      process.exit(1);
    }

    console.log(`Found ${users.length} users in organization: ${organization.name}`);

    // Clear existing chat data
    await Chat.deleteMany({ organizationId: organization._id });
    await Message.deleteMany({ organizationId: organization._id });
    console.log('Cleared existing chat data');

    // Create sample chats
    const chats = [];

    // Create a group chat with all users
    const groupChat = await Chat.create({
      organizationId: organization._id,
      name: 'General Discussion',
      type: 'group',
      participants: users.map(user => user._id),
      createdBy: users[0]._id,
      lastActivity: new Date()
    });
    chats.push(groupChat);
    console.log('Created group chat: General Discussion');

    // Create individual chats between users
    for (let i = 0; i < users.length - 1; i++) {
      for (let j = i + 1; j < users.length; j++) {
        const user1 = users[i];
        const user2 = users[j];
        
        const directChat = await Chat.create({
          organizationId: organization._id,
          type: 'direct',
          participants: [user1._id, user2._id],
          createdBy: user1._id,
          lastActivity: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) // Random time in last 7 days
        });
        chats.push(directChat);
        console.log(`Created direct chat between ${user1.firstName} ${user1.lastName} and ${user2.firstName} ${user2.lastName}`);
      }
    }

    // Create sample messages for each chat
    const sampleMessages = [
      "Hello everyone! Welcome to our team chat.",
      "Good morning! How is everyone doing today?",
      "I've completed the project review. Please check your emails.",
      "Great work on the presentation yesterday!",
      "Can we schedule a meeting for next week?",
      "The new system update looks promising.",
      "Thanks for your help with the documentation.",
      "Looking forward to our team lunch tomorrow!",
      "Please review the attached files when you have time.",
      "Have a great weekend everyone!"
    ];

    for (const chat of chats) {
      const messageCount = Math.floor(Math.random() * 5) + 3; // 3-7 messages per chat
      
      for (let i = 0; i < messageCount; i++) {
        const randomUser = chat.participants[Math.floor(Math.random() * chat.participants.length)];
        const randomMessage = sampleMessages[Math.floor(Math.random() * sampleMessages.length)];
        
        const message = await Message.create({
          organizationId: organization._id,
          chatId: chat._id,
          senderId: randomUser,
          content: randomMessage,
          type: 'text',
          status: 'delivered',
          createdAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000) // Random time in last 24 hours
        });

        // Update chat's last message and activity
        chat.lastMessage = message._id;
        chat.lastActivity = message.createdAt;
        await chat.save();
      }
      
      console.log(`Created ${messageCount} messages for chat: ${chat.name || 'Direct Chat'}`);
    }

    console.log('Chat data seeding completed successfully!');
    console.log(`Created ${chats.length} chats with sample messages`);
    process.exit(0);
  } catch (error) {
    console.error('Error seeding chat data:', error);
    process.exit(1);
  }
};

// Run the seed function
seedChatData();