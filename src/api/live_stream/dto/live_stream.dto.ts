/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { IsString, IsOptional, IsBoolean, IsArray, MaxLength, MinLength, IsNumber, Min, Max } from 'class-validator';
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
    @IsArray()
    @IsString({ each: true })
    allowedViewers?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    @IsOptional()
    @IsString()
    thumbnailUrl?: string;

    // Set by middleware
    myUser?: IUser;
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

    page?: number = 1;
    limit?: number = 20;
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
