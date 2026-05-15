import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AdminModerationController } from "./admin-moderation.controller";
import { AdminModerationService } from "./admin-moderation.service";
import { Post, PostSchema } from "src/api/posts/post/entities/post.entity";
import { ReelSchema } from "src/api/reel/entity/reel.schema";
import { MusicSchema } from "src/api/music/music.entity";
import { AuthClientModule } from "src/common/auth_client/auth_client.module";
import { AppConfigModule } from "src/api/app_config/app_config.module";

@Module({
  imports: [
    AuthClientModule,
    AppConfigModule,
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: "Reel", schema: ReelSchema },
      { name: "Music", schema: MusicSchema },
    ]),
  ],
  controllers: [AdminModerationController],
  providers: [AdminModerationService],
})
export class AdminModerationModule {}
