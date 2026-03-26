import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class PesapalCheckoutDto {
    @IsNumber()
    @Min(1)
    amount: number;

    @IsOptional()
    @IsString()
    currency?: string;

    @IsOptional()
    @IsString()
    email?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    firstName?: string;

    @IsOptional()
    @IsString()
    lastName?: string;

    @IsOptional()
    @IsString()
    description?: string;
}
