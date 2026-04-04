import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { DiscoveryController } from "./discovery.controller";
import { DiscoveryService } from "./discovery.service";
import { Post, PostSchema } from "../post_module/entity/post.schema";
import { UserSchema } from "../user_modules/user/entities/user.entity";
import { UserModule } from "../user_modules/user/user.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    AuthModule,
    UserModule,
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: "User", schema: UserSchema },
    ]),
  ],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
})
export class DiscoveryModule {}
