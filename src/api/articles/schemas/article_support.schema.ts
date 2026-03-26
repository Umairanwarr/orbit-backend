import { Document, Schema, Types } from 'mongoose';

export interface ArticleSupport extends Document {
  articleId: Types.ObjectId;
  senderId: string;
  receiverId: string;
  currency: 'KES' | 'USD';
  amountKes: number;
  status: 'pending' | 'success' | 'failed' | 'cancelled' | 'timeout';
  checkoutRequestId?: string;
  merchantRequestId?: string;
  mpesaReceiptNumber?: string;
  transactionDate?: number;
  callbackMetadata?: any;
  rawCallback?: any;
  accountReference?: string; // ART-<articleId>
  creditedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const ArticleSupportSchema = new Schema<ArticleSupport>(
  {
    articleId: { type: Schema.Types.ObjectId, ref: 'Article', required: true },
    senderId: { type: String, required: true },
    receiverId: { type: String, required: true },
    currency: { type: String, enum: ['KES', 'USD'], default: 'KES' },
    amountKes: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['pending', 'success', 'failed', 'cancelled', 'timeout'], default: 'pending' },
    checkoutRequestId: { type: String, index: true, sparse: true },
    merchantRequestId: { type: String, index: true, sparse: true },
    mpesaReceiptNumber: { type: String },
    transactionDate: { type: Number },
    callbackMetadata: { type: Schema.Types.Mixed },
    rawCallback: { type: Schema.Types.Mixed },
    accountReference: { type: String, index: true },
    creditedAt: { type: Date },
  },
  { timestamps: true, collection: 'article_support' },
);

ArticleSupportSchema.index({ articleId: 1, senderId: 1, status: 1 });
ArticleSupportSchema.index({ checkoutRequestId: 1 });
ArticleSupportSchema.index({ merchantRequestId: 1 });
