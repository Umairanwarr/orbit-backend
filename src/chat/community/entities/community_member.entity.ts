/**
 * Copyright 2025, Orbit
 * Community member entity
 */

import { Document, Schema } from 'mongoose';
import pM from 'mongoose-paginate-v2';
import { BaseUser } from '../../../core/utils/interfaceces';

export enum CommunityRoleType {
  Owner = 'owner',
  Admin = 'admin',
  Member = 'member',
}

export enum CommunityMemberStatus {
  Active = 'active',
  Pending = 'pending',
  Removed = 'removed',
}

export interface ICommunityMember extends Document {
  uId: string; // user id
  cId: string; // community id
  role: CommunityRoleType;
  status: CommunityMemberStatus;
  invitedBy?: string; // user id who invited
  userData: BaseUser;
  createdAt: Date;
}

export const CommunityMemberSchema: Schema = new Schema(
  {
    uId: { type: Schema.Types.ObjectId, required: true, ref: 'user' },
    cId: { type: Schema.Types.ObjectId, required: true, ref: 'community' },
    role: { type: String, enum: Object.values(CommunityRoleType), default: CommunityRoleType.Member },
    status: { type: String, enum: Object.values(CommunityMemberStatus), default: CommunityMemberStatus.Active },
    invitedBy: { type: Schema.Types.ObjectId, default: null, ref: 'user' },
    userData: { type: Object, required: true },
    updatedAt: { type: Date, select: false },
  },
  {
    timestamps: true,
  }
);

CommunityMemberSchema.index({ cId: 1, uId: 1 }, { unique: true });
CommunityMemberSchema.plugin(pM);
