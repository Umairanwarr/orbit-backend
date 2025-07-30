/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */
import { IsNotEmpty, IsOptional, IsBoolean, IsArray, IsString } from "class-validator";
import CommonDto from "../../../../core/common/dto/common.dto";

export class CreateMemoryDto extends CommonDto {
    @IsNotEmpty()
    storyId: string;

    @IsOptional()
    @IsArray()
    tags?: string[];

    @IsOptional()
    @IsBoolean()
    isReminderEnabled?: boolean = true;

    toJson() {
        return {
            userId: this.myUser._id,
            storyId: this.storyId,
            tags: this.tags || [],
            isReminderEnabled: this.isReminderEnabled,
            savedAt: new Date(),
            reminderDate: this.calculateReminderDate(),
        };
    }

    private calculateReminderDate(): Date {
        // Set reminder for next year on the same date
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        return nextYear;
    }
}

export class UpdateMemoryDto extends CommonDto {
    @IsOptional()
    @IsArray()
    tags?: string[];

    @IsOptional()
    @IsBoolean()
    isReminderEnabled?: boolean;
}

export class GetMemoriesDto extends CommonDto {
    @IsOptional()
    @IsString()
    page?: string = "1";

    @IsOptional()
    @IsString()
    limit?: string = "20";

    get pageNumber(): number {
        return parseInt(this.page || "1", 10);
    }

    get limitNumber(): number {
        return parseInt(this.limit || "20", 10);
    }
}
