import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AdminModerationController } from "./admin-moderation.controller";
import { AdminModerationService } from "./admin-moderation.service";
import { PostSchema } from "src/api/post_module/entity/post.schema";
import { ReelSchema } from "src/api/reel/entity/reel.schema";
import { MusicSchema } from "src/api/music/music.entity";
import { AuthModule } from "src/api/auth/auth.module";
import { AppConfigModule } from "src/api/app_config/app_config.module";

@Module({
  imports: [
    AuthModule,
    AppConfigModule,
    MongooseModule.forFeature([
      { name: "Post", schema: PostSchema },
      { name: "Reel", schema: ReelSchema },
      { name: "Music", schema: MusicSchema },
    ]),
  ],
  controllers: [AdminModerationController],
  providers: [AdminModerationService],
})
export class AdminModerationModule {}
