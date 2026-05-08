import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { BackupFrequency } from "./email-backup-settings.schema";

export type EmailBackupHistoryDocument = HydratedDocument<EmailBackupHistory>;

export type BackupStatus = "success" | "failed";

@Schema({ timestamps: true, collection: "email_backup_history" })
export class EmailBackupHistory {
  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({ type: String, enum: ["success", "failed"], required: true, index: true })
  status: BackupStatus;

  @Prop({ type: String, required: false })
  failureReason?: string;

  @Prop({ type: String, required: false })
  primaryEmail?: string;

  @Prop({ type: String, required: false })
  secondaryEmail?: string;

  @Prop({ type: String, required: false })
  frequency?: BackupFrequency;

  @Prop({ type: [String], default: [] })
  categories?: string[];

  @Prop({ type: Boolean, default: true })
  includeAttachments?: boolean;

  @Prop({ type: Boolean, default: false })
  encrypted?: boolean;

  @Prop({ type: Number, required: false })
  sizeBytes?: number;

  @Prop({ type: Number, default: 1 })
  parts?: number;

  @Prop({ type: Date, required: false })
  startedAt?: Date;

  @Prop({ type: Date, required: false })
  finishedAt?: Date;
}

export const EmailBackupHistorySchema =
  SchemaFactory.createForClass(EmailBackupHistory);

