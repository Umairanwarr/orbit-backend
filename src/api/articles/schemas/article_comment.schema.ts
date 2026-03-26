import { Document, Schema, Types } from 'mongoose';

export interface ArticleComment extends Document {
  articleId: Types.ObjectId;
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

export const ArticleCommentSchema = new Schema<ArticleComment>(
  {
    articleId: { type: Schema.Types.ObjectId, ref: 'Article', required: true, index: true },
    userId: { type: String, required: true, index: true },
    text: { type: String, required: true, trim: true },
    parentCommentId: { type: Schema.Types.ObjectId, ref: 'ArticleComment', index: true, default: null },
    userData: {
      _id: { type: String, required: true },
      fullName: { type: String, required: true },
      userImage: { type: String, required: true },
    },
  },
  { timestamps: true, collection: 'article_comments' },
);

ArticleCommentSchema.index({ articleId: 1, createdAt: -1 });
ArticleCommentSchema.index({ parentCommentId: 1 });
