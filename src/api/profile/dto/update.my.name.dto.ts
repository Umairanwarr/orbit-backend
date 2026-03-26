/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {IsArray, IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString} from "class-validator";
import CommonDto from "../../../core/common/dto/common.dto";
import {ChatRequestStatus, UserPrivacyTypes} from "../../../core/utils/enums";


export class UpdateMyNameDto extends CommonDto {
    @IsNotEmpty()
    fullName: string
}
export class UpdateMyPrivacyDto extends CommonDto {
    @IsEnum(UserPrivacyTypes)
    startChat: UserPrivacyTypes

    @IsBoolean()
    publicSearch: boolean

    @IsBoolean()
    lastSeen: boolean

    @IsBoolean()
    readReceipts: boolean

    @IsEnum(UserPrivacyTypes)
    groupAddPermission: UserPrivacyTypes

    @IsEnum(UserPrivacyTypes)
    showStory: UserPrivacyTypes

    @IsEnum(UserPrivacyTypes)
    callPermission: UserPrivacyTypes

    @IsArray()
    @IsString({ each: true })
    callAllowedUsers: string[]
    @IsArray()
    @IsString({ each: true })
    callBlockedUsers: string[]
    @IsArray()
    @IsString({ each: true })
    profilePicAllowedUsers: string[]
    @IsArray()
    @IsString({ each: true })
    profilePicBlockedUsers: string[]

    @IsOptional()
    @IsBoolean()
    hideFollowing?: boolean
}
export class UpdateChatReqStatusDto extends CommonDto {
    @IsEnum(ChatRequestStatus)
    status: ChatRequestStatus
}

export class UpdateMyBioDto extends CommonDto {
    @IsNotEmpty()
    bio: string
}

export class UpdateMyProfessionDto extends CommonDto {
    @IsNotEmpty()
    profession: string
}

export class UpdateMyPhoneNumberDto extends CommonDto {
    @IsNotEmpty()
    phoneNumber: string
}

export class UpdateMyPasswordDto extends CommonDto {
    @IsNotEmpty()
    oldPassword: string
    @IsNotEmpty()
    newPassword: string

    @IsNotEmpty()
    newConfPassword: string

    @IsBoolean()
    logoutAll: boolean
}