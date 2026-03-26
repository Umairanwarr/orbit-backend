import { Document, Schema } from 'mongoose';

export interface IArticle extends Document {
  title: string;
  description?: string;
  fileUrl: string;
  mimeType: string;
  uploaderId: Schema.Types.ObjectId;
  uploaderData: {
    _id: Schema.Types.ObjectId;
    fullName: string;
    userImage: string;
  };
  likesCount: number;
  commentsCount: number;
  likedBy: string[];
  createdAt: Date;
  updatedAt: Date;
}

export const ArticleSchema = new Schema<IArticle>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    fileUrl: { type: String, required: true },
    mimeType: { type: String, required: true },
    uploaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    uploaderData: {
      _id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      fullName: { type: String, required: true },
      userImage: { type: String, required: true },
    },
    likesCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    likedBy: { type: [String], default: [] },
  },
  {
    timestamps: true,
    collection: 'articles',
  },
);
