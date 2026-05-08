import { IsOptional, IsString } from "class-validator";

export class RestoreEmailBackupDto {
  // If encrypted, user can provide secret again for restore
  @IsOptional()
  @IsString()
  encryptionSecret?: string;
}

