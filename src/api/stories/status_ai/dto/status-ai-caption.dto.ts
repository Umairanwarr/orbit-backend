import { Allow, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { StoryType } from "../../../../core/utils/enums";

export class StatusAiCaptionDto {
  @IsEnum(StoryType)
  storyType: StoryType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  existingCaption?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  mimeType?: string;

  @Allow()
  deviceInfo?: any;
}

