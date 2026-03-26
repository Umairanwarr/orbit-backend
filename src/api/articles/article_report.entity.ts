import mongoose, { Schema } from 'mongoose';
import pM from 'mongoose-paginate-v2';

export type ArticleReportStatus = 'pending' | 'ignored' | 'removed';

export interface IArticleReport {
  uId: string;
  articleId: string;
  content: string;
  status: ArticleReportStatus;
  actionBy?: string;
  actionAt?: Date;
}

export const ArticleReportSchema = new mongoose.Schema(
  {
    uId: { type: String, required: true, ref: 'user', index: true },
    articleId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Article',
      index: true,
    },
    content: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'ignored', 'removed'],
      default: 'pending',
      index: true,
    },
    actionBy: { type: String, default: null, ref: 'user' },
    actionAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

ArticleReportSchema.index({ uId: 1, articleId: 1 }, { unique: true });
ArticleReportSchema.plugin(pM);
