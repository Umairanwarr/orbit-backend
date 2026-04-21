import { IsString, IsOptional, IsObject } from 'class-validator';

export class FirebasePhoneLoginDto {
  @IsString()
  idToken!: string;

  @IsString()
  password!: string;

  @IsString()
  deviceId!: string;

  @IsString()
  platform!: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsObject()
  @IsOptional()
  deviceInfo?: any;

  @IsString()
  @IsOptional()
  pushKey?: string;

  @IsString()
  @IsOptional()
  ip?: string;
}
