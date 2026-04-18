import { Controller, Delete, Param, UseGuards } from "@nestjs/common";
import { AdminModerationService } from "./admin-moderation.service";
import { V1Controller } from "src/core/common/v1-controller.decorator";
import { IsSuperAdminGuard } from "src/core/guards/is.admin.or.super.guard";

@V1Controller("admin/moderation")
@UseGuards(IsSuperAdminGuard)
export class AdminModerationController {
  constructor(private readonly moderationService: AdminModerationService) {}

  @Delete("posts/:id")
  async deletePost(@Param("id") postId: string) {
    const data = await this.moderationService.deletePost(postId);
    return { success: true, data };
  }

  @Delete("reels/:id")
  async deleteReel(@Param("id") reelId: string) {
    const data = await this.moderationService.deleteReel(reelId);
    return { success: true, data };
  }

  @Delete("music/:id")
  async deleteMusic(@Param("id") musicId: string) {
    const data = await this.moderationService.deleteMusic(musicId);
    return { success: true, data };
  }
}
