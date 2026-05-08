import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthModule } from "../auth/auth.module";
import { MailEmitterModule } from "../mail/mail.emitter.module";
import { MessageSchema } from "../../chat/message/entities/message.entity";
import { UserFollowSchema } from "../user_modules/user_follow/entities/user_follow.entity";

import { EmailBackupController } from "./email-backup.controller";
import { EmailBackupService } from "./email-backup.service";
import { EmailBackupScheduler } from "./email-backup.scheduler";
import {
  EmailBackupSettings,
  EmailBackupSettingsSchema,
} from "./schemas/email-backup-settings.schema";
import {
  EmailBackupHistory,
  EmailBackupHistorySchema,
} from "./schemas/email-backup-history.schema";

@Module({
  imports: [
    ConfigModule,
    ScheduleModule,
    AuthModule,
    MailEmitterModule,
    MongooseModule.forFeature([
      { name: EmailBackupSettings.name, schema: EmailBackupSettingsSchema },
      { name: EmailBackupHistory.name, schema: EmailBackupHistorySchema },
      { name: "message", schema: MessageSchema },
      // ensure user_follow model available for backup queries
      { name: "user_follow", schema: UserFollowSchema },
    ]),
  ],
  controllers: [EmailBackupController],
  providers: [EmailBackupService, EmailBackupScheduler],
  exports: [EmailBackupService],
})
export class EmailBackupModule {}

