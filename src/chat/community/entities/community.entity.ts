/**
 * Copyright 2025, Orbit
 * Community entity
 */

import { Document, Schema } from 'mongoose';

export interface ICommunity extends Document {
  // creator id
  cId: string;
  // community name
  name: string;
  // description
  desc?: string;
  // image url
  img: string;
  // settings and flags
  extraData?: {
    joinMode?: 'open' | 'approval' | 'inviteOnly';
    allowMembersInvite?: boolean;
  } | any;
  createdAt: Date;
}

export const CommunitySchema: Schema = new Schema(
  {
    cId: { type: Schema.Types.ObjectId, required: true, ref: 'user' },
    name: { type: String, required: true },
    desc: { type: String, default: null },
    img: { type: String, required: true },
    extraData: { type: Object, default: { joinMode: 'approval', allowMembersInvite: false } },
    createdAt: { type: Date, select: true },
    updatedAt: { type: Date, select: false },
  },
  {
    timestamps: true,
  }
);

CommunitySchema.index({ name: 1 });
