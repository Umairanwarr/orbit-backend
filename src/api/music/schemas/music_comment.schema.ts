import { Document, Schema, Types } from 'mongoose';

export interface MusicComment extends Document {
  musicId: Types.ObjectId;
  userId: string;
  text: string;
  parentCommentId?: Types.ObjectId;
  userData: {
    _id: string;
    fullName: string;
    userImage: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const MusicCommentSchema = new Schema<MusicComment>(
  {
    musicId: { type: Schema.Types.ObjectId, ref: 'Music', required: true, index: true },
    userId: { type: String, required: true, index: true },
    text: { type: String, required: true, trim: true },
    parentCommentId: { type: Schema.Types.ObjectId, ref: 'MusicComment', index: true, default: null },
    userData: {
      _id: { type: String, required: true },
      fullName: { type: String, required: true },
      userImage: { type: String, required: true },
    },
  },
  { timestamps: true, collection: 'music_comments' },
);

MusicCommentSchema.index({ musicId: 1, createdAt: -1 });
MusicCommentSchema.index({ parentCommentId: 1 });
