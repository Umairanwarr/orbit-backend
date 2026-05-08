import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  EmailBackupSettings,
  EmailBackupSettingsDocument,
} from "./schemas/email-backup-settings.schema";
import { EmailBackupService } from "./email-backup.service";

@Injectable()
export class EmailBackupScheduler {
  private readonly logger = new Logger(EmailBackupScheduler.name);

  constructor(
    private readonly backups: EmailBackupService,
    @InjectModel(EmailBackupSettings.name)
    private readonly settingsModel: Model<EmailBackupSettingsDocument>,
  ) {}

  // Every 15 minutes check due backups
  @Cron("*/15 * * * *")
  async tick() {
    const now = new Date();
    const due = await this.settingsModel
      .find({
        nextRunAt: { $lte: now },
      } as any)
      .limit(25)
      .lean();

    for (const s of due) {
      try {
        await this.backups.runBackupNow(s.userId, "scheduled");
      } catch (e: any) {
        this.logger.warn(
          `Scheduled backup failed user=${s.userId}: ${e?.message}`,
        );
        // Do not retry immediately; push nextRunAt forward by 1 hour
        await this.settingsModel.updateOne(
          { userId: s.userId },
          { $set: { nextRunAt: new Date(Date.now() + 60 * 60 * 1000) } },
        );
      }
    }
  }
}

