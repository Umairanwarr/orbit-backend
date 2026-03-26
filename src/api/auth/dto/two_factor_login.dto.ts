import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Length, Matches } from "class-validator";
import { Trim } from "class-sanitizer";
import { Platform } from "../../../core/utils/enums";

export class TwoFactorLoginDto {
  @IsNotEmpty()
  @IsString()
  @Length(6, 8)
  @Matches(/^[0-9]+$/)
  code: string;

  @IsEnum(Platform)
  platform: Platform;

  @IsOptional()
  @Trim()
  ip?: string;

  @IsNotEmpty()
  @Trim()
  deviceId: string;

  @IsNotEmpty()
  @IsString()
  language: string;

  @IsOptional()
  @Trim()
  pushKey?: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;

  @IsNotEmpty()
  deviceInfo: any;
}
