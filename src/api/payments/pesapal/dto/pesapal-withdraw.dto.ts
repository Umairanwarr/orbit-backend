import { IsNumber, IsOptional, IsString, Min } from "class-validator";

export class PesapalWithdrawDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  accountNumber: string;

  @IsString()
  @IsOptional()
  bankCode?: string;

  @IsString()
  @IsOptional()
  provider?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
