/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { IsString, IsOptional, IsBoolean, IsArray, ArrayMinSize, MaxLength, MinLength, IsNumber, Min, Max, IsMongoId } from 'class-validator';
import { Type } from 'class-transformer';
import { IUser } from '../../user_modules/user/entities/user.entity';

export class CreateLiveStreamDto {
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    title: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @IsOptional()
    @IsBoolean()
    isPrivate?: boolean;

    @IsOptional()
    @IsBoolean()
    requiresApproval?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    joinPrice?: number;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    allowedViewers?: string[];

    // Require at least one tag (we use the first tag as the category)
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    tags: string[];

    @IsOptional()
    @IsString()
    thumbnailUrl?: string;

    // Set by middleware
    myUser?: IUser;
}

export class UpdateRecordingPriceDto {
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    price?: number; // 0 or undefined => free

    // Set by middleware
    myUser?: IUser;
}

export class InviteUserToStreamDto {
    @IsString()
    streamId: string;

    @IsString()
    userId: string; // invitee user id

    @IsOptional()
    @IsString()
    requestType?: 'viewer' | 'cohost';

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(18)
    age?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    amountPaid?: number;

    myUser?: IUser; // set by middleware
}

export class RespondToInviteDto {
    @IsString()
    requestId: string;

    @IsString()
    action: 'accept' | 'reject';

    myUser?: IUser; // set by middleware
}

export class JoinLiveStreamDto {
    @IsString()
    streamId: string;

    // Set by middleware
    myUser?: IUser;
}

export class SendLiveStreamMessageDto {
    @IsString()
    @MinLength(1)
    @MaxLength(500)
    message: string;

    @IsOptional()
    @IsString()
    messageType?: 'text' | 'emoji' | 'gift';

    @IsOptional()
    giftData?: {
        giftId: string;
        giftName: string;
        giftImage: string;
        giftPrice: number;
        currency?: string;
    };

    // Set by middleware
    myUser?: IUser;
}

export class UpdateLiveStreamDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    title?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @IsOptional()
    @IsBoolean()
    isPrivate?: boolean;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    allowedViewers?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    // Set by middleware
    myUser?: IUser;
}

export class LiveStreamFilterDto {
    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    @IsOptional()
    @IsString()
    status?: 'live' | 'scheduled' | 'ended';

    @IsOptional()
    @IsString()
    sortBy?: 'viewerCount' | 'createdAt' | 'startedAt';

    @IsOptional()
    @IsString()
    sortOrder?: 'asc' | 'desc';

    @IsOptional()
    @Type(() => Number)
    page?: number = 1;
    @IsOptional()
    @Type(() => Number)
    limit?: number = 20;
}

export class UpdateRecordingPrivacyDto {
    @IsOptional()
    @IsBoolean()
    isPrivate?: boolean;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    allowedViewers?: string[];

    // Set by middleware
    myUser?: IUser;
}

export class RemoveParticipantDto {
    @IsString()
    participantId: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    reason?: string;

    // Set by middleware
    myUser?: IUser;
}

export class BanParticipantDto {
    @IsString()
    participantId: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    reason?: string;

    @IsOptional()
    @IsString()
    duration?: 'temporary' | 'permanent';

    // Set by middleware
    myUser?: IUser;
}

export class UpdateStreamFilterDto {
    @IsString()
    filterType: string;

    @IsString()
    faceFilterType: string;

    @IsNumber()
    @Min(0)
    @Max(2)
    intensity: number;

    @IsBoolean()
    isEnabled: boolean;

    // Set by middleware
    myUser?: IUser;
}

export class RequestJoinStreamDto {
    @IsString()
    streamId: string;

    @IsOptional()
    @IsString()
    requestType?: 'viewer' | 'cohost';

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(18)
    age?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    amountPaid?: number;

    // Set by middleware
    myUser?: IUser;
}

export class RespondToJoinRequestDto {
    @IsString()
    requestId: string;

    @IsString()
    action: 'approve' | 'deny';

    // Set by middleware
    myUser?: IUser;
}

export class StartRecordingDto {
    @IsOptional()
    @IsString()
    streamId?: string; // Set by controller from URL params

    @IsOptional()
    @IsString()
    quality?: string; // Recording quality (720p, 1080p, etc.)

    // Set by middleware
    myUser?: IUser;
}

export class StopRecordingDto {
    @IsOptional()
    @IsString()
    streamId?: string; // Set by controller from URL params

    @IsString()
    recordingUrl: string;

    @IsOptional()
    @IsNumber()
    duration?: number; // Duration in seconds

    @IsOptional()
    @IsNumber()
    fileSize?: number; // File size in bytes

    @IsOptional()
    @IsString()
    thumbnailUrl?: string;

    // Set by middleware
    myUser?: IUser;
}

export class RecordingFilterDto {
    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    @IsOptional()
    @IsString()
    streamerId?: string;

    @IsOptional()
    @IsString()
    status?: 'processing' | 'completed' | 'failed';

    @IsOptional()
    @IsString()
    sortBy?: 'recordedAt' | 'viewCount' | 'duration' | 'likesCount';

    @IsOptional()
    @IsString()
    sortOrder?: 'asc' | 'desc';

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    limit?: number = 20;
}
