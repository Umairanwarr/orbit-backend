/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { LiveStreamStatus, ParticipantRole } from '../interfaces/live_stream.interface';

@Schema({ timestamps: true })
export class LiveStream extends Document {
    @Prop({ required: true })
    title: string;

    @Prop()
    description: string;

    @Prop({ required: true })
    streamerId: string;

    @Prop({
        type: {
            _id: { type: String, required: true },
            fullName: { type: String, required: true },
            userImage: { type: String, required: true }
        },
        required: true
    })
    streamerData: {
        _id: string;
        fullName: string;
        userImage: string;
    };

    @Prop({ required: true, unique: true })
    channelName: string;

    @Prop({ required: true })
    agoraToken: string;

    @Prop({ 
        type: String, 
        enum: Object.values(LiveStreamStatus), 
        default: LiveStreamStatus.SCHEDULED 
    })
    status: LiveStreamStatus;

    @Prop({ default: 0 })
    viewerCount: number;

    @Prop({ default: 0 })
    maxViewers: number;

    @Prop({ default: 0 })
    likesCount: number;

    @Prop({ type: [String] })
    likedBy: string[];

    @Prop({ default: false })
    isPrivate: boolean;

    @Prop({ type: [String] })
    allowedViewers: string[];

    @Prop({ type: [String] })
    bannedUsers: string[];

    @Prop({ default: false })
    requiresApproval: boolean;

    @Prop({ type: [String] })
    tags: string[];

    @Prop()
    thumbnailUrl: string;

    @Prop()
    startedAt: Date;

    @Prop()
    endedAt: Date;

    @Prop()
    duration: number;

    @Prop()
    pinnedMessageId: string;
}

@Schema({ timestamps: true })
export class LiveStreamParticipant extends Document {
    @Prop({ required: true })
    streamId: string;

    @Prop({ required: true })
    userId: string;

    @Prop({
        type: {
            _id: { type: String, required: true },
            fullName: { type: String, required: true },
            userImage: { type: String, required: true }
        },
        required: true
    })
    userData: {
        _id: string;
        fullName: string;
        userImage: string;
    };

    @Prop({ 
        type: String, 
        enum: Object.values(ParticipantRole), 
        default: ParticipantRole.VIEWER 
    })
    role: ParticipantRole;

    @Prop({ default: Date.now })
    joinedAt: Date;

    @Prop()
    leftAt: Date;

    @Prop({ default: true })
    isActive: boolean;
}

@Schema({ timestamps: true })
export class LiveStreamMessage extends Document {
    @Prop({ required: true })
    streamId: string;

    @Prop({ required: true })
    userId: string;

    @Prop({
        type: {
            _id: { type: String, required: true },
            fullName: { type: String, required: true },
            userImage: { type: String, required: true }
        },
        required: true
    })
    userData: {
        _id: string;
        fullName: string;
        userImage: string;
    };

    @Prop({ required: true })
    message: string;

    @Prop({ 
        type: String, 
        enum: ['text', 'emoji', 'gift'], 
        default: 'text' 
    })
    messageType: string;

    @Prop({
        type: {
            giftId: String,
            giftName: String,
            giftImage: String,
            giftPrice: Number
        }
    })
    giftData: {
        giftId: string;
        giftName: string;
        giftImage: string;
        giftPrice: number;
    };

    @Prop({ default: false })
    isPinned: boolean;

    @Prop()
    pinnedAt: Date;

    @Prop()
    pinnedBy: string;
}

@Schema({ timestamps: true })
export class LiveStreamJoinRequest extends Document {
    @Prop({ required: true })
    streamId: string;

    @Prop({ required: true })
    userId: string;

    @Prop({
        type: {
            _id: { type: String, required: true },
            fullName: { type: String, required: true },
            userImage: { type: String, required: true }
        },
        required: true
    })
    userData: {
        _id: string;
        fullName: string;
        userImage: string;
    };

    @Prop({
        type: String,
        enum: ['pending', 'approved', 'denied'],
        default: 'pending'
    })
    status: string;

    @Prop()
    requestedAt: Date;

    @Prop()
    respondedAt: Date;

    @Prop()
    respondedBy: string;
}

export const LiveStreamSchema = SchemaFactory.createForClass(LiveStream);
export const LiveStreamParticipantSchema = SchemaFactory.createForClass(LiveStreamParticipant);
export const LiveStreamMessageSchema = SchemaFactory.createForClass(LiveStreamMessage);
export const LiveStreamJoinRequestSchema = SchemaFactory.createForClass(LiveStreamJoinRequest);
