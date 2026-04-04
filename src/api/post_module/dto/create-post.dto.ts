import {
  IsString,
  IsOptional,
  IsArray,
  IsMongoId,
  MaxLength,
} from "class-validator";
import { Transform } from "class-transformer";

export class CreatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(2200, { message: "Caption cannot exceed 2200 characters" })
  caption?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @IsOptional()
  @Transform(({ value }) => {
    // Safely transforms comma-separated strings into arrays (e.g., "tag1, tag2" -> ["tag1", "tag2"])
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      return value
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
    }
    return [];
  })
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @Transform(({ value }) => {
    // Transforms strings to arrays and ensures they are ready for MongoDB validation
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      return value
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
    }
    return [];
  })
  @IsArray()
  @IsMongoId({
    each: true,
    message: "Each tagged user must be a valid MongoDB ObjectId",
  })
  taggedUsers?: string[];
}
