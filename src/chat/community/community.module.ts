/**
 * Community module
 */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';
import { CommunitySchema } from './entities/community.entity';
import { CommunityMemberSchema } from './entities/community_member.entity';
import { CommunityAnnouncementSchema } from './entities/community_announcement.entity';
import { AuthModule } from '../../api/auth/auth.module';
import { AppConfigModule } from '../../api/app_config/app_config.module';
import { FileUploaderModule } from '../../common/file_uploader/file_uploader.module';
import { UserModule } from '../../api/user_modules/user/user.module';
import { GroupSettingsModule } from '../group_settings/group_settings.module';
import { ChannelModule } from '../channel/channel.module';
import { RoomMemberModule } from '../room_member/room_member.module';

@Module({
  controllers: [CommunityController],
  providers: [CommunityService],
  imports: [
    MongooseModule.forFeature([
      { name: 'community', schema: CommunitySchema },
      { name: 'community_member', schema: CommunityMemberSchema },
      { name: 'community_announcement', schema: CommunityAnnouncementSchema },
    ]),
    AuthModule,
    AppConfigModule,
    FileUploaderModule,
    UserModule,
    GroupSettingsModule,
    ChannelModule,
    RoomMemberModule,
  ],
  exports: [CommunityService],
})
export class CommunityModule {}
