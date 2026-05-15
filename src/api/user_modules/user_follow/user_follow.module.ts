import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { UserFollowSchema } from "./entities/user_follow.entity";
import { UserFollowService } from "./user_follow.service";
import { UserFollowController } from "./user_follow.controller";
import { UserModule } from "../user/user.module";
import { BanModule } from "../../ban/ban.module";
import { AuthClientModule } from "src/common/auth_client/auth_client.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: "user_follow",
        schema: UserFollowSchema,
      },
    ]),
    UserModule,
    AuthClientModule,
    BanModule,
  ],
  controllers: [UserFollowController],
  providers: [UserFollowService],
  exports: [UserFollowService],
})
export class UserFollowModule {}
