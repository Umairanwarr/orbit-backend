import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsMongoId,
} from "class-validator";

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000, { message: "Comment cannot exceed 1000 characters" })
  content: string;

  // If the frontend sends this, it becomes a reply (Feature 9)
  @IsOptional()
  @IsMongoId()
  parentCommentId?: string;
}
