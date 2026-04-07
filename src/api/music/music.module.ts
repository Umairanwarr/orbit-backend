import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { MusicSchema } from "./music.entity";
import { MusicService } from "./music.service";
import { MusicController } from "./music.controller";
import { MusicPublicController } from "./music_public.controller";
import { AuthModule } from "../auth/auth.module";
import { FileUploaderModule } from "../../common/file_uploader/file_uploader.module";
import { UserModule } from "../user_modules/user/user.module";
import { VerifiedAuthGuard } from "../../core/guards/verified.auth.guard";
import { MusicSupportSchema } from "./schemas/music_support.schema";
import { MusicCommentSchema } from "./schemas/music_comment.schema";
import { PesapalModule } from "../payments/pesapal/pesapal.module";
import { MusicReportSchema } from "./music_report.entity";
import { MusicReportService } from "./music_report.service";
import { NotificationEmitterModule } from "../../common/notification_emitter/notification_emitter.module";
import { UserFollowModule } from "../user_modules/user_follow/user_follow.module";
import { UserDeviceModule } from "../user_modules/user_device/user_device.module";
import { MusicHistorySchema } from "./schemas/music-history.schema";
import { MusicQueueSchema } from "./schemas/music-queue.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "Music", schema: MusicSchema },
      { name: "MusicSupport", schema: MusicSupportSchema },
      { name: "MusicComment", schema: MusicCommentSchema },
      { name: "music_reports", schema: MusicReportSchema },
      { name: "music_history", schema: MusicHistorySchema },
      { name: "music_queue", schema: MusicQueueSchema },
    ]),
    AuthModule,
    FileUploaderModule,
    UserModule,
    PesapalModule,
    NotificationEmitterModule,
    UserFollowModule,
    UserDeviceModule,
  ],
  providers: [MusicService, MusicReportService, VerifiedAuthGuard],
  exports: [MusicService, MusicReportService],
  controllers: [MusicController, MusicPublicController],
})
export class MusicModule {}
