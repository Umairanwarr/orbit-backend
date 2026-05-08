import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from "class-validator";

export class UpdateEmailBackupSettingsDto {
  @IsEmail()
  primaryEmail: string;

  @IsOptional()
  @IsEmail()
  secondaryEmail?: string;

  @IsIn(["daily", "weekly", "monthly"])
  frequency: "daily" | "weekly" | "monthly";

  @IsBoolean()
  includeAttachments: boolean;

  @IsBoolean()
  encrypted: boolean;

  // Used to encrypt backups; stored encrypted with server secret for scheduling
  @IsOptional()
  encryptionSecret?: string;

  @IsInt()
  @Min(1)
  @Max(500)
  sizeLimitMb: number;

  @IsArray()
  @IsIn(["chats", "media", "contacts"], { each: true })
  categories: Array<"chats" | "media" | "contacts">;
}

