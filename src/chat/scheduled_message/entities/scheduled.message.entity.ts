/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Document, Schema } from 'mongoose';
import pM from 'mongoose-paginate-v2';
import { MessageType, Platform } from '../../../core/utils/enums';

export interface IScheduledMessage extends Document {
  sId: string; // sender id
  sName: string;
  sImg: string;
  plm: string; // platform
  rId: string; // room id
  c: string; // content
  mT: MessageType; // message type
  msgAtt?: object | null; // attachment
  lId: string; // local id (uuid)
  isEncrypted: boolean;
  isOneSeen: boolean;
  scheduledAt: Date;
  status: 'pending' | 'sending' | 'sent' | 'canceled' | 'failed';
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
  sentMessageId?: string | null;
}

export const ScheduledMessageSchema: Schema = new Schema(
  {
    sId: { type: Schema.Types.ObjectId, required: true },
    sName: { type: String, required: true },
    sImg: { type: String, required: false, default: '/v-public/default_user_image.png' },
    plm: { type: String, enum: Object.values(Platform), required: true },
    rId: { type: Schema.Types.ObjectId, required: true, index: 1 },
    c: { type: String, required: true },
    isEncrypted: { type: Boolean, default: false },
    mT: { type: String, enum: Object.values(MessageType), required: true },
    msgAtt: { type: Object, default: null },
    lId: { type: String, required: true },
    isOneSeen: { type: Boolean, default: false },
    scheduledAt: { type: Date, required: true, index: 1 },
    status: { type: String, enum: ['pending', 'sending', 'sent', 'canceled', 'failed'], default: 'pending', index: 1 },
    error: { type: String, default: null },
    sentMessageId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

ScheduledMessageSchema.plugin(pM);

ScheduledMessageSchema.index({ scheduledAt: 1, status: 1 });
