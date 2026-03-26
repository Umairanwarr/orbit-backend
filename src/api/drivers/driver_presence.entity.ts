import { Document, Schema, Types } from 'mongoose';

export interface IDriverPresence extends Document {
  userId: Types.ObjectId;
  vehicleType?: string;
  lat: number;
  lng: number;
  loc: { type: 'Point'; coordinates: [number, number] };
  updatedAt: Date;
}

const DriverPresenceSchema = new Schema<IDriverPresence>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  vehicleType: { type: String },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  loc: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  updatedAt: { type: Date, default: () => new Date(), index: true },
}, { collection: 'driver_presence' });

DriverPresenceSchema.index({ loc: '2dsphere' });
// TTL: auto-expire records after 10 minutes of inactivity
DriverPresenceSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 600 });

export { DriverPresenceSchema };
