import { Document, Schema, Types } from 'mongoose';

export interface ITicket extends Document {
  name: string;
  priceKes: number;
  expiryDate: Date;
  imageUrl?: string;
  category?: string;
  quantity: number;
  soldCount: number;
  uploaderId: Types.ObjectId;
  isSold: boolean;
  buyerIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export const TicketSchema = new Schema<ITicket>(
  {
    name: { type: String, required: true, trim: true },
    priceKes: { type: Number, required: true, min: 1 },
    expiryDate: { type: Date, required: true },
    imageUrl: { type: String, required: false },
    category: { type: String, required: false, trim: true },
    quantity: { type: Number, required: true, default: 1, min: 1 },
    soldCount: { type: Number, default: 0, min: 0 },
    uploaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    isSold: { type: Boolean, default: false, index: true },
    buyerIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true, collection: 'tickets' },
);

TicketSchema.index({ createdAt: -1 });
TicketSchema.index({ expiryDate: 1 });
TicketSchema.index({ category: 1 });
