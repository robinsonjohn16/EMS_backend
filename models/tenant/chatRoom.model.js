import mongoose from 'mongoose';

const { Schema } = mongoose;

const ParticipantSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'TenantUser', required: true },
  joinedAt: { type: Date, default: Date.now },
  lastReadAt: { type: Date },
  isActive: { type: Boolean, default: true },
}, { _id: false });

const ChatRoomSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  type: { type: String, enum: ['direct', 'group'], required: true, index: true },
  name: { type: String },
  participants: { type: [ParticipantSchema], default: [] },
  directKey: { type: String, index: true }, // for direct rooms: sorted user ids string
  createdBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
}, { timestamps: true });

// Ensure uniqueness for direct rooms per organization
ChatRoomSchema.index({ organizationId: 1, type: 1, directKey: 1 }, { unique: true, partialFilterExpression: { type: 'direct' } });

// Helper to set directKey for direct chats with 2 participants
ChatRoomSchema.pre('validate', function(next) {
  if (this.type === 'direct' && Array.isArray(this.participants) && this.participants.length === 2) {
    const ids = this.participants.map(p => String(p.userId)).sort();
    this.directKey = ids.join(':');
  }
  next();
});

export default mongoose.model('ChatRoom', ChatRoomSchema);