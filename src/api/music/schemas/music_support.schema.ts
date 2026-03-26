import { Document, Schema, Types } from 'mongoose';

export interface MusicSupport extends Document {
  musicId: Types.ObjectId;
  senderId: string; // supporter userId
  receiverId: string; // uploader userId
  currency: 'KES' | 'USD';
  amountKes: number;
  status: 'pending' | 'success' | 'failed' | 'cancelled' | 'timeout';
  checkoutRequestId?: string;
  merchantRequestId?: string;
  mpesaReceiptNumber?: string;
  transactionDate?: number;
  callbackMetadata?: any;
  rawCallback?: any;
  accountReference?: string; // MUS-<musicId>
  creditedAt?: Date; // when receiver wallet credited
  createdAt: Date;
  updatedAt: Date;
}

export const MusicSupportSchema = new Schema<MusicSupport>(
  {
    musicId: { type: Schema.Types.ObjectId, ref: 'Music', required: true },
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
  { timestamps: true },
);

MusicSupportSchema.index({ musicId: 1, senderId: 1, status: 1 });
MusicSupportSchema.index({ checkoutRequestId: 1 });
MusicSupportSchema.index({ merchantRequestId: 1 });
