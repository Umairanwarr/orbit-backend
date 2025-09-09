// social-login.dto.ts
import { IsEnum, IsOptional, IsString } from "class-validator";
import { RegisterMethod } from "src/core/utils/enums";

export class SocialLoginDto {
  @IsString()
  accessToken: string;

  @IsString()
  deviceId: string;

  @IsString()
  deviceInfo: string;

  @IsString()
  language: string;

  @IsString()
  platform: string;

  @IsString()
  pushKey: string;

  @IsOptional()
  @IsString()
  ip?: string;

  @IsOptional()
  @IsEnum(RegisterMethod)
  registerMethod: RegisterMethod;
}
