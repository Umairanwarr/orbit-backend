import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class InitiateStkDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  phone: string; // e.g., 2547XXXXXXXX or 07XXXXXXXX

  @IsString()
  @IsOptional()
  accountReference?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
