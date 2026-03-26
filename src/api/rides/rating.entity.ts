import { Document, Schema, Types } from 'mongoose';

export interface IRating extends Document {
  rideId: Types.ObjectId;
  raterId: Types.ObjectId;
  rateeId: Types.ObjectId;
  stars: number; // 1..5
  comment?: string | null;
  createdAt: Date;
}

export const RatingSchema = new Schema<IRating>({
  rideId: { type: Schema.Types.ObjectId, ref: 'Ride', required: true, index: true },
  raterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  rateeId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  stars: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, default: null },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'ratings' });

// Ensure one rating per ride per rater
RatingSchema.index({ rideId: 1, raterId: 1 }, { unique: true });
