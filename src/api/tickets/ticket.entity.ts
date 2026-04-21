import { Document, Schema, Types } from 'mongoose';

export interface ITicket extends Document {
  name: string;
  priceKes: number;
  expiryDate: Date;
  imageUrl?: string;
  uploaderId: Types.ObjectId;
  isSold: boolean;
  soldToId?: Types.ObjectId;
  soldAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const TicketSchema = new Schema<ITicket>(
  {
    name: { type: String, required: true, trim: true },
    priceKes: { type: Number, required: true, min: 1 },
    expiryDate: { type: Date, required: true },
    imageUrl: { type: String, required: false },
    uploaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    isSold: { type: Boolean, default: false, index: true },
    soldToId: { type: Schema.Types.ObjectId, ref: 'User' },
    soldAt: { type: Date },
  },
  { timestamps: true, collection: 'tickets' },
);

TicketSchema.index({ createdAt: -1 });
TicketSchema.index({ expiryDate: 1 });
