import { Document, Schema, Types } from 'mongoose';

export type ScheduledStatus = 'scheduled' | 'dispatched' | 'canceled';

export interface IScheduledRide extends Document {
  passengerId: Types.ObjectId;
  passengersCount?: number;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  fareKes: number;
  rideType?: string;
  paymentMethod?: string;
  scheduledAt: Date;
  status: ScheduledStatus;
  dispatchedCount?: number;
  dispatchedAt?: Date | null;
  lastAttemptAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ScheduledRideSchema = new Schema<IScheduledRide>({
  passengerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  passengersCount: { type: Number, required: false, default: 1 },
  pickupAddress: { type: String, required: true },
  dropoffAddress: { type: String, required: true },
  pickupLat: { type: Number, required: true },
  pickupLng: { type: Number, required: true },
  dropoffLat: { type: Number, required: true },
  dropoffLng: { type: Number, required: true },
  fareKes: { type: Number, required: true },
  rideType: { type: String },
  paymentMethod: { type: String },
  scheduledAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ['scheduled','dispatched','canceled'], default: 'scheduled', index: true },
  dispatchedCount: { type: Number, default: 0 },
  dispatchedAt: { type: Date, default: null },
  lastAttemptAt: { type: Date, default: null },
}, { timestamps: true, collection: 'scheduled_rides' });

ScheduledRideSchema.index({ status: 1, scheduledAt: 1 });
