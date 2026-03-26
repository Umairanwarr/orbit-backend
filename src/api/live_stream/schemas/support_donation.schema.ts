/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Document, Schema, Types } from 'mongoose';

export interface SupportDonation extends Document {
  streamId: Types.ObjectId;
  senderId: string; // donor userId string
  receiverId: string; // streamerId string
  currency: 'KES' | 'USD';
  amountKes: number;
  status: 'pending' | 'success' | 'failed' | 'cancelled' | 'timeout';
  checkoutRequestId?: string;
  merchantRequestId?: string;
  mpesaReceiptNumber?: string;
  transactionDate?: number;
  callbackMetadata?: any;
  rawCallback?: any;
  accountReference?: string; // e.g., SUP-<supportId>
  creditedAt?: Date; // when host wallet was credited
  createdAt: Date;
  updatedAt: Date;
}

export const SupportDonationSchema: Schema = new Schema(
  {
    streamId: { type: Schema.Types.ObjectId, ref: 'LiveStream', required: true },
    senderId: { type: String, required: true },
    receiverId: { type: String, required: true },
    currency: { type: String, enum: ['KES', 'USD'], default: 'KES' },
    amountKes: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['pending', 'success', 'failed', 'cancelled', 'timeout'], default: 'pending' },
    checkoutRequestId: { type: String, index: true, sparse: true },
    merchantRequestId: { type: String, index: true, sparse: true },
    mpesaReceiptNumber: { type: String },
    transactionDate: { type: Number },
    callbackMetadata: { type: Schema.Types.Mixed },
    rawCallback: { type: Schema.Types.Mixed },
    accountReference: { type: String, index: true },
    creditedAt: { type: Date },
  },
  { timestamps: true },
);

SupportDonationSchema.index({ streamId: 1, senderId: 1, status: 1 });
SupportDonationSchema.index({ checkoutRequestId: 1 });
SupportDonationSchema.index({ merchantRequestId: 1 });
