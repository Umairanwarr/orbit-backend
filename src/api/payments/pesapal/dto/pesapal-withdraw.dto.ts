import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsOptional,
  Min,
  IsIn,
} from "class-validator";
import { Type } from "class-transformer";

export class PesapalWithdrawDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Min(50, { message: "Minimum withdrawal amount is 50" })
  amount: number;

  @IsNotEmpty()
  @IsString()
  currency: string;

  @IsNotEmpty()
  @IsString()
  accountNumber: string;

  @IsOptional()
  @IsString()
  bankCode?: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(["MPESA", "BANK", "AIRTEL_MONEY"])
  provider: string;

  @IsOptional()
  @IsString()
  description?: string;
}
