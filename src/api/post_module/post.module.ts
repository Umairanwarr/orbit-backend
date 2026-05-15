import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { PostController } from "./post.controller";
import { PostService } from "./post.service";

// Import all the schemas
import { Post, PostSchema } from "./entity/post.schema";
import { Like, LikeSchema } from "./entity/like.schema";
import { Comment, CommentSchema } from "./entity/comment.schema";
import { Save, SaveSchema } from "./entity/save.schema";
import { AuthClientModule } from "src/common/auth_client/auth_client.module";

// If your VerifiedAuthGuard requires an AuthClientModule to be imported,
// make sure to import it here.
// import { AuthClientModule } from "src/common/auth_client/auth_client.module";

@Module({
  imports: [
    // Register all schemas with Mongoose for this module
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Like.name, schema: LikeSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Save.name, schema: SaveSchema },
      // { name: Story.name, schema: StorySchema },
    ]),
    AuthClientModule, // Uncomment if needed for your guards
  ],
  controllers: [PostController],
  providers: [PostService],
  exports: [PostService], // Exported in case other modules (like notifications) need post data later
})
export class PostModule {}
