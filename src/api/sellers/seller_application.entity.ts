import mongoose from 'mongoose';
import pM from 'mongoose-paginate-v2';

export type SellerApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface ISellerApplication {
  userId: string;
  idImageUrl: string;
  status: SellerApplicationStatus;
  note?: string;
  reviewedBy?: string;
  reviewedAt?: Date | null;
}

export const SellerApplicationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    idImageUrl: { type: String, required: true },

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

SellerApplicationSchema.index({ userId: 1, createdAt: -1 });
SellerApplicationSchema.plugin(pM);
