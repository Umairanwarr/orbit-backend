import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class B2CRequestDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  phone: string; // 2547XXXXXXXX or 07XXXXXXXX

  @IsString()
  @IsOptional()
  remarks?: string;

  @IsString()
  @IsOptional()
  occasion?: string;
}
