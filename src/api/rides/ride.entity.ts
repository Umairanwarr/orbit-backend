import { Document, Schema, Types, model } from 'mongoose';

export type RideStatus = 'requested' | 'assigned' | 'driver_arrived' | 'started' | 'completed' | 'canceled';

export interface IRide extends Document {
  passengerId: Types.ObjectId;
  driverId?: Types.ObjectId | null;
  passengersCount?: number;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  fareKes: number;
  rideType?: string;
  status: RideStatus;
  vehicleType?: string;
  vehicleModel?: string;
  vehiclePlate?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const RideSchema = new Schema<IRide>({
  passengerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  driverId: { type: Schema.Types.ObjectId, ref: 'User', required: false, default: null, index: true },
  passengersCount: { type: Number, required: false, default: 1 },
  pickupAddress: { type: String, required: true },
  dropoffAddress: { type: String, required: true },
  pickupLat: { type: Number, required: true },
  pickupLng: { type: Number, required: true },
  dropoffLat: { type: Number, required: true },
  dropoffLng: { type: Number, required: true },
  fareKes: { type: Number, required: true },
  rideType: { type: String },
  status: { type: String, enum: ['requested','assigned','driver_arrived','started','completed','canceled'], default: 'requested', index: true },
  vehicleType: { type: String },
  vehicleModel: { type: String },
  vehiclePlate: { type: String },
}, { timestamps: true, collection: 'rides' });

RideSchema.index({ driverId: 1, status: 1 });
RideSchema.index({ passengerId: 1, status: 1 });
