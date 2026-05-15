import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthClientModule } from "src/common/auth_client/auth_client.module";
import { MailEmitterModule } from "../mail/mail.emitter.module";
import { MessageSchema } from "../../chat/message/entities/message.entity";
import { UserFollowSchema } from "../user_modules/user_follow/entities/user_follow.entity";
import { RoomMemberSchema } from "../../chat/room_member/entities/room_member.entity";

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
    AuthClientModule,
    MailEmitterModule,
    MongooseModule.forFeature([
      { name: EmailBackupSettings.name, schema: EmailBackupSettingsSchema },
      { name: EmailBackupHistory.name, schema: EmailBackupHistorySchema },
      { name: "message", schema: MessageSchema },
      // ensure user_follow model available for backup queries
      { name: "user_follow", schema: UserFollowSchema },
      // room_member model for per-chat backup exports
      { name: "room_member", schema: RoomMemberSchema },
    ]),
  ],
  controllers: [EmailBackupController],
  providers: [EmailBackupService, EmailBackupScheduler],
  exports: [EmailBackupService],
})
export class EmailBackupModule {}

