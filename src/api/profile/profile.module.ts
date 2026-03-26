/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ProfileService } from "./profile.service";
import { ProfileController } from "./profile.controller";
import { UserModule } from "../user_modules/user/user.module";
import { UserDeviceModule } from "../user_modules/user_device/user_device.module";
import { AuthModule } from "../auth/auth.module";
import { VersionsModule } from "../versions/versions.module";
import { FileUploaderModule } from "../../common/file_uploader/file_uploader.module";
import { UserBanModule } from "../user_modules/user_ban/user_ban.module";
import { AppConfigModule } from "../app_config/app_config.module";
import { AdminNotificationModule } from "../admin_notification/admin_notification.module";
import { GroupMemberModule } from "../../chat/group_member/group_member.module";
import { BroadcastMemberModule } from "../../chat/broadcast_member/broadcast_member.module";
import { RoomMemberModule } from "../../chat/room_member/room_member.module";
import { UserVersionModule } from "../user_modules/user_version/user_version.module";
import { ReportSystemModule } from "../report_system/report_system.module";
import { SocketIoModule } from "../../chat/socket_io/socket_io.module";
import { BanModule } from "../ban/ban.module";
import { NotificationEmitterModule } from "../../common/notification_emitter/notification_emitter.module";
import { ChatRequestModule } from "../../chat/chat_request/chat_request.module";
import { ChannelModule } from "../../chat/channel/channel.module";
import { ProfileNotificationEmitter } from "./profile_notification_emitter";
import { MongooseModule } from "@nestjs/mongoose";
import { UserSchema } from "../user_modules/user/entities/user.entity";
import { VerificationModule } from "../verification/verification.module";
import { AdsModule } from "../ads/ads.module";
import { AdSubmissionSchema } from "../ads/schemas/ad_submission.schema";
import { PesapalModule } from "../payments/pesapal/pesapal.module";
import { EmergencyContactModule } from "../user_modules/emergency_contact/emergency_contact.module";
import { WithdrawRequestsModule } from "../wallet/withdraw_requests.module";
import { UserFollowModule } from "../user_modules/user_follow/user_follow.module";

@Module({
  controllers: [ProfileController],
  providers: [ProfileService, ProfileNotificationEmitter],
  exports: [ProfileService],
  imports: [
    UserModule,
    FileUploaderModule,
    UserBanModule,
    AuthModule,
    UserDeviceModule,
    VersionsModule,
    AppConfigModule,
    AdminNotificationModule,
    GroupMemberModule,
    BroadcastMemberModule,
    RoomMemberModule,
    UserVersionModule,
    ReportSystemModule,
    SocketIoModule,
    NotificationEmitterModule,
    ChatRequestModule,
    ChannelModule,
    VerificationModule,
    AdsModule,
    PesapalModule,
    EmergencyContactModule,
    UserFollowModule,
    MongooseModule.forFeature([
      { name: "users", schema: UserSchema },
      { name: 'AdSubmission', schema: AdSubmissionSchema },
    ]),
    EventEmitterModule,
    WithdrawRequestsModule,
  ],
})
export class ProfileModule { }
