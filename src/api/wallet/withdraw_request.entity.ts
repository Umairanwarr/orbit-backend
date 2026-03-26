import mongoose from 'mongoose';
import pM from 'mongoose-paginate-v2';

export type WithdrawStatus = 'pending' | 'approved' | 'rejected';

export interface IWithdrawRequest {
  userId: string;
  amount: number;
  phone: string;
  status: WithdrawStatus;
  note?: string;
  reviewedBy?: string; // admin id
  reviewedAt?: Date | null;
}

export const WithdrawRequestSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    phone: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    note: { type: String, default: null },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

WithdrawRequestSchema.index({ userId: 1, createdAt: -1 });
WithdrawRequestSchema.plugin(pM);
