import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Post, PostSchema } from './entities/post.entity';
import { PostCommentSchema } from './entities/post_comment.entity';
import { PostService } from './post.service';
import { PostController } from './post.controller';
import { FileUploaderModule } from 'src/common/file_uploader/file_uploader.module';
import { AuthClientModule } from "src/common/auth_client/auth_client.module";
import { VerifiedAuthGuard } from 'src/core/guards/verified.auth.guard';
import { UserFollowModule } from 'src/api/user_modules/user_follow/user_follow.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: 'PostComment', schema: PostCommentSchema },
    ]),
    FileUploaderModule,
    AuthClientModule,
    UserFollowModule,
  ],
  controllers: [PostController],
  providers: [PostService, VerifiedAuthGuard],
  exports: [PostService],
})
export class PostModule {}
