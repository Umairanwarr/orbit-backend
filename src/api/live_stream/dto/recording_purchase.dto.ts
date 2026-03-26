import { IsNotEmpty, IsString } from 'class-validator';

export class InitiateRecordingPurchaseDto {
  @IsString()
  @IsNotEmpty()
  phone: string; // 2547XXXXXXXX or 07XXXXXXXX
}
