import { IsOptional, IsString, IsEnum, IsObject, IsArray, IsBoolean } from 'class-validator';
import { PostType } from '../entities/post.entity';

export class CreatePostDto {
  @IsEnum(PostType)
  postType: PostType;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsObject()
  media?: {
    url?: string;
    thumbnail?: string;
    mimeType?: string;
    fileSize?: number;
    duration?: number;
    width?: number;
    height?: number;
  };

  // Pre-uploaded URLs (multi-photo)
  @IsOptional()
  @IsArray()
  mediaUrls?: string[];

  @IsOptional()
  @IsObject()
  location?: {
    latitude?: number;
    longitude?: number;
    address?: string;
    placeName?: string;
  };

  @IsOptional()
  @IsBoolean()
  isReel?: boolean;
}

export class UpdatePostDto {
  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsObject()
  media?: any;

  @IsOptional()
  @IsObject()
  location?: any;
}

export class QueryPostDto {
  @IsOptional()
  @IsEnum(PostType)
  postType?: PostType;

  @IsOptional()
  @IsString()
  hashtag?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
