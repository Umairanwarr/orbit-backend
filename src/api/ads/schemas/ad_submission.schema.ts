/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Document, Schema } from 'mongoose';

export type AdSubmissionStatus = 'pending' | 'success' | 'failed' | 'cancelled' | 'timeout';

export interface AdSubmission extends Document {
  userId: string;
  title: string;
  imageUrl: string;
  linkUrl?: string | null;
  amountKes: number;
  currency?: 'KES' | 'USD';
  status: AdSubmissionStatus;
  checkoutRequestId?: string;
  merchantRequestId?: string;
  mpesaReceiptNumber?: string;
  transactionDate?: number;
  callbackMetadata?: any;
  rawCallback?: any;
  accountReference?: string; // e.g., AD-<submissionId>
  adId?: string | null; // created Ad id after success
  createdAt: Date;
  updatedAt: Date;
}

export const AdSubmissionSchema: Schema = new Schema(
  {
    userId: { type: String, required: true, ref: 'user' },
    title: { type: String, required: true },
    imageUrl: { type: String, required: true },
    linkUrl: { type: String, default: null },
    amountKes: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['KES', 'USD'], default: 'KES' },
    status: { type: String, enum: ['pending', 'success', 'failed', 'cancelled', 'timeout'], default: 'pending', index: true },
    checkoutRequestId: { type: String, index: true, sparse: true },
    merchantRequestId: { type: String, index: true, sparse: true },
    mpesaReceiptNumber: { type: String },
    transactionDate: { type: Number },
    callbackMetadata: { type: Schema.Types.Mixed },
    rawCallback: { type: Schema.Types.Mixed },
    accountReference: { type: String, index: true },
    adId: { type: String, default: null },
  },
  { timestamps: true },
);

AdSubmissionSchema.index({ userId: 1, status: 1, createdAt: -1 });
AdSubmissionSchema.index({ accountReference: 1 });
