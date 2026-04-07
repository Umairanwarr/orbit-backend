import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  Get,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  Param,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { ReelService } from "./reel.service";
import { VerifiedAuthGuard } from "src/core/guards/verified.auth.guard";
import { V1Controller } from "src/core/common/v1-controller.decorator";

@UseGuards(VerifiedAuthGuard)
@V1Controller("reels")
export class ReelController {
  constructor(private readonly reelService: ReelService) {}

  @Post("upload")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "video", maxCount: 1 },
        { name: "cover", maxCount: 1 },
      ],
      {
        limits: { fileSize: 100 * 1024 * 1024 },
      },
    ),
  )
  async uploadReel(
    @Req() req: any,
    @UploadedFiles()
    files: { video?: Express.Multer.File[]; cover?: Express.Multer.File[] },
    @Body() body: any,
  ) {
    if (!files || !files.video || !files.cover) {
      throw new BadRequestException("Both video and cover files are required");
    }

    const data = await this.reelService.uploadReel(req.user, files, body);

    return {
      success: true,
      data,
    };
  }

  @Get("audio/trending")
  async getTrendingAudio(
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const safeLimit = limit > 30 ? 30 : limit;
    const data = await this.reelService.getTrendingAudio(safeLimit);

    return {
      success: true,
      data,
    };
  }

  @Post(":id/like")
  async toggleLike(@Req() req: any, @Param("id") reelId: string) {
    if (!reelId) throw new BadRequestException("Reel ID is required");
    const data = await this.reelService.toggleLike(req.user, reelId);
    return { success: true, data };
  }

  @Post(":id/comments")
  async addComment(
    @Req() req: any,
    @Param("id") reelId: string,
    @Body("content") content: string,
    @Body("parentCommentId") parentCommentId?: string,
  ) {
    if (!content || content.trim() === "") {
      throw new BadRequestException("Comment content is required");
    }
    const data = await this.reelService.addComment(
      req.user,
      reelId,
      content,
      parentCommentId,
    );
    return { success: true, data };
  }

  @Post(":id/share")
  async trackShare(@Param("id") reelId: string) {
    const data = await this.reelService.incrementShare(reelId);
    return { success: true, data };
  }

  @Post(":id/download-track")
  async trackDownload(@Param("id") reelId: string) {
    const data = await this.reelService.incrementDownload(reelId);
    return { success: true, data };
  }

  @Get("feed")
  async getReelsFeed(
    @Req() req: any,
    @Query("limit", new DefaultValuePipe(5), ParseIntPipe) limit: number,
  ) {
    // Keep the batch size small (5-10) for faster loading on mobile
    const safeLimit = limit > 10 ? 10 : limit;
    const data = await this.reelService.getReelsFeed(req.user, safeLimit);

    return {
      success: true,
      data,
    };
  }

  @Post(":id/view")
  async trackView(@Param("id") reelId: string) {
    if (!reelId) throw new BadRequestException("Reel ID is required");

    const data = await this.reelService.incrementView(reelId);
    return { success: true, data };
  }
}
