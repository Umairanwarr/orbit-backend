import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class C2BSimulateDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  msisdn: string; // 2547XXXXXXXX or 07XXXXXXXX

  @IsString()
  @IsOptional()
  billRefNumber?: string;
}
