import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class WalletWithdrawDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsOptional()
  phone?: string; // 2547XXXXXXXX or 07XXXXXXXX

  @IsString()
  @IsOptional()
  remarks?: string;
}
