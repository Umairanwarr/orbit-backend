import { Document, Schema } from 'mongoose';

export interface IMusic extends Document {
  title: string;
  description?: string;
  genre?: string;
  mediaUrl: string;
  mediaType: 'audio' | 'video';
  category?: 'music' | 'audio' | 'video';
  mimeType: string;
  durationMs?: number;
  thumbnailUrl?: string;
  uploaderId: Schema.Types.ObjectId;
  uploaderData: {
    _id: Schema.Types.ObjectId;
    fullName: string;
    userImage: string;
  };
  playsCount: number;
  likesCount: number;
  commentsCount: number;
  likedBy: string[];
  createdAt: Date;
  updatedAt: Date;
}

export const MusicSchema = new Schema<IMusic>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    genre: { type: String, trim: true },
    mediaUrl: { type: String, required: true },
    mediaType: { type: String, enum: ['audio', 'video'], required: true, index: true },
    category: { type: String, enum: ['music', 'audio', 'video'], index: true },
    mimeType: { type: String, required: true },
    durationMs: { type: Number },
    thumbnailUrl: { type: String },
    uploaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    uploaderData: {
      _id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      fullName: { type: String, required: true },
      userImage: { type: String, required: true },
    },
    playsCount: { type: Number, default: 0 },
    likesCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    likedBy: { type: [String], default: [] },
  },
  {
    timestamps: true,
    collection: 'music',
  },
);
