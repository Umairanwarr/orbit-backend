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

    @Prop()
    joinPrice: number; // Price required to join when requiresApproval is true

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
            giftPrice: Number,
            currency: String,
        }
    })
    giftData: {
        giftId: string;
        giftName: string;
        giftImage: string;
        giftPrice: number;
        currency?: string;
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

    @Prop({
        type: String,
        enum: ['viewer', 'cohost'],
        default: 'viewer'
    })
    requestType: string;

    @Prop({ default: false })
    initiatedByHost: boolean;

    @Prop()
    age: number;

    @Prop()
    amountPaid: number;

    @Prop({ default: false })
    paid: boolean;

    @Prop()
    requestedAt: Date;

    @Prop()
    respondedAt: Date;

    @Prop()
    respondedBy: string;
}

@Schema({ timestamps: true })
export class LiveStreamRecording extends Document {
    @Prop({ required: true })
    streamId: string;

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

    @Prop()
    recordingUrl: string; // Set when recording is completed

    @Prop()
    thumbnailUrl: string;

    @Prop({ required: true })
    duration: number; // Duration in seconds

    @Prop({ required: true })
    recordedAt: Date;

    @Prop({ default: 0 })
    viewCount: number;

    @Prop({ default: 0 })
    likesCount: number;

    @Prop({ type: [String] })
    likedBy: string[];

    @Prop({ type: [String] })
    tags: string[];

    @Prop({ default: false })
    isPrivate: boolean;

    @Prop({ type: [String] })
    allowedViewers: string[];

    @Prop({
        type: String,
        enum: ['processing', 'completed', 'failed'],
        default: 'processing'
    })
    status: string;

    @Prop()
    fileSize: number; // File size in bytes

    @Prop()
    quality: string; // Recording quality (720p, 1080p, etc.)

    @Prop()
    price: number; // Optional price; undefined or 0 => free

    // Agora Cloud Recording fields
    @Prop()
    agoraResourceId: string; // Agora resource ID for the recording session

    @Prop()
    agoraSid: string; // Agora session ID for the recording

    @Prop({ type: Array, default: [] })
    agoraFileList: any[]; // List of files from Agora recording
}

export const LiveStreamSchema = SchemaFactory.createForClass(LiveStream);
export const LiveStreamParticipantSchema = SchemaFactory.createForClass(LiveStreamParticipant);
export const LiveStreamMessageSchema = SchemaFactory.createForClass(LiveStreamMessage);
export const LiveStreamJoinRequestSchema = SchemaFactory.createForClass(LiveStreamJoinRequest);
export const LiveStreamRecordingSchema = SchemaFactory.createForClass(LiveStreamRecording);
