/**
 * Copyright 2025, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import mongoose from 'mongoose';
import pM from 'mongoose-paginate-v2';

export type VerificationStatus = 'pending' | 'approved' | 'rejected';
export type VerificationFeePlan = 'monthly' | 'six_months' | 'yearly';

export interface IVerificationRequest {
  userId: string;
  idImageUrl: string;
  selfieImageUrl: string;
  paymentReference?: string;
  paymentScreenshotUrl?: string;
  feePlan?: VerificationFeePlan;
  feeDurationMonths?: number;
  status: VerificationStatus;
  note?: string;
  reviewedBy?: string; // admin id
  reviewedAt?: Date | null;
  feeAtSubmission?: number; // snapshot of fee
  paidVia?: 'wallet' | 'mpesa' | 'manual' | null;
  refundedAt?: Date | null;
  refundedAmount?: number;
}

export const VerificationRequestSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, ref: 'user' },
    idImageUrl: { type: String, required: true },
    selfieImageUrl: { type: String, required: true },
    paymentReference: { type: String, default: null },
    paymentScreenshotUrl: { type: String, default: null },
    feePlan: { type: String, enum: ['monthly', 'six_months', 'yearly'], default: null },
    feeDurationMonths: { type: Number, default: null },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    note: { type: String, default: null },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    feeAtSubmission: { type: Number, default: null },
    paidVia: { type: String, enum: ['wallet', 'mpesa', 'manual'], default: null },
    refundedAt: { type: Date, default: null },
    refundedAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

VerificationRequestSchema.index({ userId: 1, createdAt: -1 });
VerificationRequestSchema.plugin(pM);
