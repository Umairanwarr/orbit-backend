/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Document, Schema, Types } from 'mongoose';

export interface GiftPurchase extends Document {
  streamId: Types.ObjectId;
  giftId: Types.ObjectId;
  senderId: string; // userId string
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
  accountReference?: string; // e.g., GIFT-<streamId>-<giftId>
  used?: boolean; // used to generate a message already
  createdAt: Date;
  updatedAt: Date;
}

export const GiftPurchaseSchema: Schema = new Schema(
  {
    streamId: { type: Schema.Types.ObjectId, ref: 'LiveStream', required: true },
    giftId: { type: Schema.Types.ObjectId, ref: 'gift', required: true },
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
    used: { type: Boolean, default: false },
  },
  { timestamps: true },
);

GiftPurchaseSchema.index({ streamId: 1, senderId: 1, giftId: 1, status: 1 });
GiftPurchaseSchema.index({ checkoutRequestId: 1 });
GiftPurchaseSchema.index({ merchantRequestId: 1 });
