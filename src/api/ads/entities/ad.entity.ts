/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import mongoose, { Schema } from 'mongoose';
import pM from 'mongoose-paginate-v2';

export interface IAd {
  userId: string;
  title: string;
  imageUrl: string;
  linkUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  note?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  isActive?: boolean;
  feeAtSubmission?: number;
  submissionId?: string | null;
  refundedAt?: Date | null;
  refundedAmount?: number;
}

export const AdSchema = new mongoose.Schema<IAd>(
  {
    userId: { type: String, required: true, ref: 'user' },
    title: { type: String, required: true },
    imageUrl: { type: String, required: true },
    linkUrl: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    note: { type: String, default: null },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    feeAtSubmission: { type: Number, default: 0 },
    submissionId: { type: String, default: null, index: true, sparse: true },
    refundedAt: { type: Date, default: null },
    refundedAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

AdSchema.index({ status: 1, createdAt: -1 });
AdSchema.plugin(pM);
