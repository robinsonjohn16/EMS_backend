import mongoose from 'mongoose';

const { Schema } = mongoose;

const AttachmentSchema = new Schema({
  url: String,
  type: { type: String, enum: ['image','file','audio','video'] },
  name: String,
  size: Number,
}, { _id: false });

const ChatMessageSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  roomId: { type: Schema.Types.ObjectId, ref: 'ChatRoom', required: true, index: true },
  senderUserId: { type: Schema.Types.ObjectId, ref: 'TenantUser', required: true, index: true },
  content: { type: String },
  contentType: { type: String, enum: ['text','system','image','file'], default: 'text' },
  attachments: { type: [AttachmentSchema], default: [] },
}, { timestamps: true });

ChatMessageSchema.index({ roomId: 1, createdAt: 1 });

export default mongoose.model('ChatMessage', ChatMessageSchema);