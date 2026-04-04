import {
  Controller,
  Get,
  Req,
  UseGuards,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
  Param,
} from "@nestjs/common";
import { DiscoveryService } from "./discovery.service";
import { VerifiedAuthGuard } from "src/core/guards/verified.auth.guard";
import { V1Controller } from "src/core/common/v1-controller.decorator";

@UseGuards(VerifiedAuthGuard)
@V1Controller("discovery")
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get("creators/featured")
  async getFeaturedCreators(
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const safeLimit = limit > 30 ? 30 : limit;
    const data = await this.discoveryService.getFeaturedCreators(safeLimit);

    return {
      success: true,
      data,
    };
  }

  @Get("friends/suggested")
  async getSuggestedFriends(
    @Req() req: any,
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const safeLimit = limit > 30 ? 30 : limit;
    const data = await this.discoveryService.getSuggestedFriends(
      req.user,
      safeLimit,
    );

    return {
      success: true,
      data,
    };
  }

  @Get("snaps/public")
  async getPublicSnaps(
    @Query("cursor") cursor?: string,
    @Query("limit", new DefaultValuePipe(15), ParseIntPipe) limit?: number,
  ) {
    const safeLimit = limit > 50 ? 50 : limit;
    const data = await this.discoveryService.getPublicSnapFeed(
      cursor,
      safeLimit,
    );

    return {
      success: true,
      data,
    };
  }

  @Get("explore")
  async getExploreFeed(
    @Req() req: any,
    @Query("limit", new DefaultValuePipe(15), ParseIntPipe) limit: number,
  ) {
    const safeLimit = limit > 50 ? 50 : limit;
    const data = await this.discoveryService.getExploreFeed(
      req.user,
      safeLimit,
    );
    return { success: true, data };
  }

  // --- Feature 2: Trending Reels ---
  @Get("reels/trending")
  async getTrendingReels(
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const safeLimit = limit > 30 ? 30 : limit;
    const data = await this.discoveryService.getTrendingReels(safeLimit);
    return { success: true, data };
  }

  // --- Feature 3: Trending Hashtags ---
  @Get("hashtags/trending")
  async getTrendingHashtags(
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const safeLimit = limit > 50 ? 50 : limit;
    const data = await this.discoveryService.getTrendingHashtags(safeLimit);
    return { success: true, data };
  }

  // --- Feature 5: Category Discovery ---
  @Get("categories/:category")
  async getCategoryPosts(
    @Param("category") category: string,
    @Query("cursor") cursor?: string,
    @Query("limit", new DefaultValuePipe(15), ParseIntPipe) limit?: number,
  ) {
    if (!category) {
      throw new BadRequestException("Category is required");
    }

    const safeLimit = limit > 50 ? 50 : limit;
    const data = await this.discoveryService.getCategoryPosts(
      category,
      cursor,
      safeLimit,
    );
    return { success: true, data };
  }
}
