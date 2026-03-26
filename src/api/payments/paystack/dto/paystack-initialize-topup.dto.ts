import { IsNumber, IsOptional, IsString, Min } from "class-validator";

export class PaystackInitializeTopupDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;
}
