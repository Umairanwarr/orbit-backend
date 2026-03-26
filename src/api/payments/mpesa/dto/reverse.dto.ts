import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class ReverseDto {
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsOptional()
  remarks?: string;
}
