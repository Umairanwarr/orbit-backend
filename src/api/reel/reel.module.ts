import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ReelController } from "./reel.controller";
import { ReelService } from "./reel.service";

// Import all the Reel schemas
import { Reel, ReelSchema } from "./entity/reel.schema";
import { ReelLike, ReelLikeSchema } from "./entity/reel-like.schema";
import { ReelComment, ReelCommentSchema } from "./entity/reel-comment.schema";
import { MusicSchema } from "../music/music.entity";
import { AuthModule } from "../auth/auth.module";

// If you need to populate the Audio, you need to import the Music schema.
// Assuming it is exported from your MusicModule.

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Reel.name, schema: ReelSchema },
      { name: ReelLike.name, schema: ReelLikeSchema },
      { name: ReelComment.name, schema: ReelCommentSchema },
      { name: "Music", schema: MusicSchema }, // For the Trending Audio $lookup
    ]),
  ],
  controllers: [ReelController],
  providers: [ReelService],
})
export class ReelModule {}
