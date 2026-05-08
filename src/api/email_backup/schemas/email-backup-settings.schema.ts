import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type EmailBackupSettingsDocument = HydratedDocument<EmailBackupSettings>;

export type BackupFrequency = "daily" | "weekly" | "monthly";

export type BackupCategory = "chats" | "media" | "contacts";

@Schema({ timestamps: true, collection: "email_backup_settings" })
export class EmailBackupSettings {
  @Prop({ type: String, required: true, unique: true, index: true })
  userId: string;

  @Prop({ type: String, required: true })
  primaryEmail: string;

  @Prop({ type: String, required: false })
  secondaryEmail?: string;

  @Prop({ type: String, enum: ["daily", "weekly", "monthly"], default: "weekly" })
  frequency: BackupFrequency;

  @Prop({ type: Boolean, default: true })
  includeAttachments: boolean;

  @Prop({ type: Boolean, default: false })
  encrypted: boolean;

  // Stored encrypted with server secret (pragmatic for automated backups)
  @Prop({ type: String, required: false })
  encryptionSecretEnc?: string;

  @Prop({ type: Number, default: 100 })
  sizeLimitMb: number;

  @Prop({ type: [String], default: ["chats", "media", "contacts"] })
  categories: BackupCategory[];

  @Prop({ type: Date, required: false })
  lastRunAt?: Date;

  @Prop({ type: Date, required: false, index: true })
  nextRunAt?: Date;
}

export const EmailBackupSettingsSchema =
  SchemaFactory.createForClass(EmailBackupSettings);

