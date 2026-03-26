/**
 * Copyright 2025
 */
import mongoose from 'mongoose';
import pM from 'mongoose-paginate-v2';

export type DriverApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface IDriverApplication {
  userId: string;
  vehicleType: string;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleCapacity?: number;
  idImageUrl?: string;
  selfieImageUrl?: string;
  licenseUrl?: string;
  logbookUrl?: string;
  insuranceUrl?: string;
  inspectionUrl?: string;
  kraPinUrl?: string;
  vehicleImageUrl?: string;
  status: DriverApplicationStatus;
  note?: string;
  reviewedBy?: string; // admin id
  reviewedAt?: Date | null;
  // Subscription fee fields
  feeAtSubmission?: number; // snapshot of fee
  paidVia?: 'wallet' | null;
  refundedAt?: Date | null;
  refundedAmount?: number;
}

export const DriverApplicationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    vehicleType: { type: String, required: true },
    vehicleModel: { type: String, required: true },
    vehiclePlate: { type: String, required: true },
    vehicleCapacity: { type: Number, default: null },

    idImageUrl: { type: String, default: null },
    selfieImageUrl: { type: String, default: null },
    licenseUrl: { type: String, default: null },
    logbookUrl: { type: String, default: null },
    insuranceUrl: { type: String, default: null },
    inspectionUrl: { type: String, default: null },
    kraPinUrl: { type: String, default: null },
    vehicleImageUrl: { type: String, default: null },

    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    note: { type: String, default: null },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    // Subscription fee fields
    feeAtSubmission: { type: Number, default: null },
    paidVia: { type: String, enum: ['wallet'], default: null },
    refundedAt: { type: Date, default: null },
    refundedAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

DriverApplicationSchema.index({ userId: 1, createdAt: -1 });
DriverApplicationSchema.plugin(pM);
