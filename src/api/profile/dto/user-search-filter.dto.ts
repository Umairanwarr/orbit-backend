import { IsOptional, IsString, IsBoolean, IsNumber } from "class-validator";
import { Transform } from "class-transformer";

export class UserSearchFilterDto {
  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  verifiedOnly?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  page: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  limit: number = 10;

  // Location-based filtering
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  maxDistance?: number; // Maximum distance in kilometers

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  nearbyOnly?: boolean; // Flag to enable location-based filtering
}
