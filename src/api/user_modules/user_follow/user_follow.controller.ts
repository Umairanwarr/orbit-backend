import { Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { V1Controller } from "../../../core/common/v1-controller.decorator";
import { VerifiedAuthGuard } from "../../../core/guards/verified.auth.guard";
import { MongoPeerIdDto } from "../../../core/common/dto/mongo.peer.id.dto";
import { resOK } from "../../../core/utils/res.helpers";
import { UserFollowService } from "./user_follow.service";
import { MongoIdDto } from "../../../core/common/dto/mongo.id.dto";

@UseGuards(VerifiedAuthGuard)
@V1Controller("user-follow")
export class UserFollowController {
  constructor(private readonly userFollowService: UserFollowService) {}

  @Post("/:peerId/follow")
  async follow(@Param() dto: MongoPeerIdDto, @Req() req: any) {
    dto.myUser = req.user;
    return resOK(await this.userFollowService.follow(dto));
  }

  @Post("/:peerId/unfollow")
  async unfollow(@Param() dto: MongoPeerIdDto, @Req() req: any) {
    dto.myUser = req.user;
    return resOK(await this.userFollowService.unfollow(dto));
  }

  @Get("/:peerId/follow")
  async isFollowing(@Param() dto: MongoPeerIdDto, @Req() req: any) {
    dto.myUser = req.user;
    return resOK(
      await this.userFollowService.isFollowing(dto.myUser._id, dto.peerId)
    );
  }

  @Get("/:id/counts")
  async counts(@Param() dto: MongoIdDto) {
    return resOK(await this.userFollowService.getCounts(dto.id));
  }

  @Get("/:id/followers")
  async followers(@Param() dto: MongoIdDto, @Query() q: any, @Req() req: any) {
    return resOK(await this.userFollowService.paginateFollowers(dto.id, req.user._id, q));
  }

  @Get("/:id/following")
  async following(@Param() dto: MongoIdDto, @Query() q: any, @Req() req: any) {
    return resOK(await this.userFollowService.paginateFollowing(dto.id, req.user._id, q));
  }
}
