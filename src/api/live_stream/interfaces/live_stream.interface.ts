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
    status: 'pending' | 'approved' | 'denied';
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

export enum ParticipantRole {
    STREAMER = 'streamer',
    VIEWER = 'viewer',
    MODERATOR = 'moderator'
}
