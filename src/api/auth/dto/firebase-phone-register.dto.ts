import { IsString, IsOptional, IsObject } from 'class-validator';

export class FirebasePhoneRegisterDto {
  @IsString()
  idToken!: string;

  @IsString()
  fullName!: string;

  @IsString()
  password!: string;

  @IsString()
  @IsOptional()
  profession?: string;

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
}
