/**
 * Copyright 2025, Orbit
 * Community announcement entity
 */

import { Document, Schema } from 'mongoose';

export interface ICommunityAnnouncement extends Document {
  cId: string; // community id
  uId: string; // author user id
  title?: string | null;
  content: string;
  pinned?: boolean;
  userData?: {
    _id: string;
    fullName: string;
    fullNameEn?: string;
    userImage?: string;
  } | null;
  createdAt: Date;
}

export const CommunityAnnouncementSchema: Schema = new Schema(
  {
    cId: { type: Schema.Types.ObjectId, required: true, ref: 'community' },
    uId: { type: Schema.Types.ObjectId, required: true, ref: 'user' },
    title: { type: String, default: null },
    content: { type: String, required: true },
    pinned: { type: Boolean, default: false },
    userData: { type: Object, default: null },
    updatedAt: { type: Date, select: false },
  },
  {
    timestamps: true,
  }
);

CommunityAnnouncementSchema.index({ cId: 1, _id: -1 });
