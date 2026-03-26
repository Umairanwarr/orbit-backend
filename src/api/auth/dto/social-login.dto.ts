// social-login.dto.ts
import { IsBoolean, IsEnum, IsOptional, IsString } from "class-validator";
import { Platform, RegisterMethod } from "src/core/utils/enums";

export class SocialLoginDto {
  @IsString()
  accessToken: string;

  @IsString()
  deviceId: string;

  @IsString()
  deviceInfo: string;

  @IsString()
  language: string;

  @IsEnum(Platform)
  platform: Platform;

  @IsString()
  pushKey: string;

  @IsOptional()
  @IsString()
  ip?: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;

  @IsOptional()
  @IsEnum(RegisterMethod)
  registerMethod: RegisterMethod;
}
