/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Document } from 'mongoose';
import { IUser } from '../../user_modules/user/entities/user.entity';

export interface ILiveStream extends Document {
    _id: string;
    title: string;
    description?: string;
    streamerId: string;
    streamerData: {
        _id: string;
        fullName: string;
        userImage: string;
    };
    channelName: string;
    agoraToken: string;
    status: LiveStreamStatus;
    viewerCount: number;
    maxViewers: number;
    likesCount: number;
    likedBy?: string[]; // User IDs who liked the stream
    isPrivate: boolean;
    allowedViewers?: string[]; // User IDs who can view private streams
    bannedUsers?: string[]; // User IDs who are banned from the stream
    requiresApproval?: boolean; // Whether public streams require host approval to join
    joinPrice?: number; // Price required to join when requiresApproval is true
    tags?: string[];
    thumbnailUrl?: string;
    startedAt?: Date;
    endedAt?: Date;
    duration?: number; // in seconds
    pinnedMessageId?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ILiveStreamParticipant extends Document {
    _id: string;
    streamId: string;
    userId: string;
    userData: {
        _id: string;
        fullName: string;
        userImage: string;
    };
    role: ParticipantRole;
    joinedAt: Date;
    leftAt?: Date;
    isActive: boolean;
}

export interface ILiveStreamMessage extends Document {
    _id: string;
    streamId: string;
    userId: string;
    userData: {
        _id: string;
        fullName: string;
        userImage: string;
    };
    message: string;
    messageType: 'text' | 'emoji' | 'gift';
    giftData?: {
        giftId: string;
        giftName: string;
        giftImage: string;
        giftPrice: number;
    };
    isPinned?: boolean;
    pinnedAt?: Date;
    pinnedBy?: string;
    createdAt: Date;
}

export interface ILiveStreamJoinRequest extends Document {
    _id: string;
    streamId: string;
    userId: string;
    userData: {
        _id: string;
        fullName: string;
        userImage: string;
    };
    // requestType indicates whether the request is for normal view access or co-hosting
    // default: 'viewer' to preserve existing behaviour
    requestType?: 'viewer' | 'cohost';
    // initiatedByHost marks whether the host initiated this invite (true) or it was requested by the user (false/undefined)
    initiatedByHost?: boolean;
    status: 'pending' | 'approved' | 'denied';
    age?: number; // viewer provided age
    amountPaid?: number; // simulated paid amount
    paid?: boolean; // whether payment was done (stub)
    requestedAt: Date;
    respondedAt?: Date;
    respondedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

export enum LiveStreamStatus {
    SCHEDULED = 'scheduled',
    LIVE = 'live',
    ENDED = 'ended',
    CANCELLED = 'cancelled'
}

export interface ILiveStreamRecording extends Document {
    _id: string;
    streamId: string;
    streamerId: string;
    streamerData: {
        _id: string;
        fullName: string;
        userImage: string;
    };
    title: string;
    description?: string;
    recordingUrl: string;
    thumbnailUrl?: string;
    duration: number; // Duration in seconds
    recordedAt: Date;
    viewCount: number;
    likesCount: number;
    likedBy: string[];
    tags: string[];
    isPrivate: boolean;
    allowedViewers: string[];
    status: 'processing' | 'completed' | 'failed';
    fileSize?: number;
    quality?: string;
    price?: number; // Optional price in primary currency; absent/0 => free
    // Agora Cloud Recording fields
    agoraResourceId?: string;
    agoraSid?: string;
    agoraFileList?: any[];
    createdAt: Date;
    updatedAt: Date;
}

export enum ParticipantRole {
    STREAMER = 'streamer',
    VIEWER = 'viewer',
    MODERATOR = 'moderator'
}
