import { Document, Schema, Types } from 'mongoose';

export interface PostComment extends Document {
  postId: Types.ObjectId;
  userId: string;
  text: string;
  parentCommentId?: Types.ObjectId | null;
  userData: {
    _id: string;
    fullName: string;
    userImage: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const PostCommentSchema = new Schema<PostComment>(
  {
    postId: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
      index: true,
    },
    userId: { type: String, required: true, index: true },
    text: { type: String, required: true, trim: true },
    parentCommentId: {
      type: Schema.Types.ObjectId,
      ref: 'PostComment',
      default: null,
    },
    userData: {
      _id: { type: String, required: true },
      fullName: { type: String, required: true },
      userImage: { type: String, default: '' },
    },
  },
  { timestamps: true, collection: 'post_comments' },
);

PostCommentSchema.index({ postId: 1, createdAt: -1 });
PostCommentSchema.index({ parentCommentId: 1 });
