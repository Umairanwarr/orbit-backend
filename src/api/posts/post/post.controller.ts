import {
  Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, Req, UseInterceptors, UploadedFiles, BadRequestException, NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { PostService } from './post.service';
import { CreatePostDto, UpdatePostDto, QueryPostDto } from './dto/post.dto';
import { V1Controller } from 'src/core/common/v1-controller.decorator';
import { VerifiedAuthGuard } from 'src/core/guards/verified.auth.guard';
import { FileUploaderService } from 'src/common/file_uploader/file_uploader.service';
import { CreateS3UploaderDto } from 'src/common/file_uploader/create-s3_uploader.dto';
import { PostType } from './entities/post.entity';
import { resOK } from 'src/core/utils/res.helpers';
import { ConfigService } from "@nestjs/config";
import axios from "axios";

@V1Controller('posts')
@UseGuards(VerifiedAuthGuard)
export class PostController {
  constructor(
    private readonly postService: PostService,
    private readonly fileUploaderService: FileUploaderService,
    private readonly config: ConfigService,
  ) {}

  // ─── Upload + create (multipart) ────────────────────────────────────────────
  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', 10))
  async createWithUpload(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('postType') postType: string,
    @Body('caption') caption: string,
    @Body('location') locationJson: string,
    @Body('isReel') isReelRaw: string,
    @Req() req: any,
  ) {
    const userId = req.user?._id || req.user?.id;
    const isReel = isReelRaw === 'true';
    const location = locationJson ? JSON.parse(locationJson) : undefined;

    const validTypes = Object.values(PostType) as string[];
    if (!validTypes.includes(postType)) {
      throw new BadRequestException(`Invalid postType: ${postType}`);
    }

    const pType = postType as PostType;

    // Upload files to Cloudinary
    const uploadedUrls: string[] = [];
    let primaryMedia: any = null;

    if (files && files.length > 0) {
      for (const file of files) {
        const uploaderDto = new CreateS3UploaderDto();
        uploaderDto.mediaBuffer = file.buffer;
        uploaderDto.fileName = file.originalname;
        uploaderDto.myUser = { _id: userId } as any;
        // Optimize videos eagerly for posts/reels
        uploaderDto.optimizeVideoEagerly = true;
        const url = await this.fileUploaderService.uploadChatMedia(uploaderDto);
        uploadedUrls.push(url);
      }

      const firstFile = files[0];
      primaryMedia = {
        url: uploadedUrls[0],
        mimeType: firstFile.mimetype,
        fileSize: firstFile.size,
      };
    }

    const dto: CreatePostDto = {
      postType: pType,
      caption,
      media: primaryMedia,
      mediaUrls: uploadedUrls,
      location,
      isReel,
    };

    return resOK(await this.postService.create(dto, userId));
  }

  // ─── JSON create (text / location) ──────────────────────────────────────────
  @Post()
  async create(@Body() dto: CreatePostDto, @Req() req: any) {
    const userId = req.user?._id || req.user?.id;
    return resOK(await this.postService.create(dto, userId));
  }

  @Get()
  async findAll(@Query() query: QueryPostDto, @Query('page') page: number = 1, @Query('limit') limit: number = 20, @Req() req: any) {
    const currentUserId = req.user?._id?.toString() || req.user?.id?.toString();
    return resOK(await this.postService.findAll(query, page, limit, currentUserId));
  }

  @Get('reels')
  async findReels(@Query('page') page: number = 1, @Query('limit') limit: number = 20, @Req() req: any) {
    const base = this.config
      .get<string>("REELS_STORY_SERVICE_BASE_URL", "")
      .replace(/\/+$/, "");
    if (!base) {
      throw new ServiceUnavailableException(
        "REELS_STORY_SERVICE_BASE_URL is not configured"
      );
    }

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(30, Number(limit) || 20));
    const headers: Record<string, string> = {};
    const authHeader =
      (req.headers?.authorization as string) ??
      (req.headers?.Authorization as string);
    if (authHeader) headers.Authorization = authHeader;

    let cursor: string | undefined;
    let feedPayload: any = { data: [], nextCursor: null };

    for (let i = 1; i <= safePage; i++) {
      const feedRes = await axios.get(`${base}/api/v1/reels/feed`, {
        params: { limit: safeLimit, ...(cursor ? { cursor } : {}) },
        headers,
        timeout: 15000,
      });
      feedPayload = feedRes?.data ?? { data: [], nextCursor: null };
      if (i < safePage) {
        cursor = feedPayload?.nextCursor || undefined;
        if (!cursor) break;
      }
    }

    const reels = Array.isArray(feedPayload?.data) ? feedPayload.data : [];
    const docs = reels.map((reel: any) => {
      const uploader = reel?.uploaderData ?? {};
      return {
        _id: reel?._id,
        userId: {
          _id: uploader?._id ?? reel?.uploaderId ?? "",
          fullName: uploader?.fullName ?? "",
          userImage: uploader?.userImage ?? "",
          username: uploader?.username ?? "",
          isFollowing: uploader?.isFollowing === true,
        },
        postType: "reel",
        caption: reel?.caption ?? "",
        mentionedUsers: [],
        hashtags: Array.isArray(reel?.hashtags) ? reel.hashtags : [],
        media: {
          url: reel?.mediaUrl ?? "",
          thumbnail: reel?.coverUrl ?? "",
          mimeType: "video/mp4",
        },
        mediaUrls: reel?.mediaUrl ? [reel.mediaUrl] : [],
        location: null,
        likesCount: reel?.likesCount ?? 0,
        viewsCount: reel?.viewsCount ?? 0,
        commentsCount: reel?.commentsCount ?? 0,
        sharesCount: reel?.sharesCount ?? 0,
        likedBy: reel?.hasLiked === true ? [req.user?._id ?? "me"] : [],
        currentUserId: req.user?._id?.toString?.() ?? "",
        isReel: true,
        createdAt: reel?.createdAt ?? new Date().toISOString(),
      };
    });

    return resOK({
      docs,
      total: docs.length,
      page: safePage,
      limit: safeLimit,
      totalPages: feedPayload?.nextCursor ? safePage + 1 : safePage,
      nextCursor: feedPayload?.nextCursor ?? null,
    });
  }

  @Get('my')
  async getMyPosts(@Req() req: any, @Query('page') page: number = 1, @Query('limit') limit: number = 20) {
    const userId = req.user?._id || req.user?.id;
    return resOK(await this.postService.getMyPosts(userId, page, limit));
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const post = await this.postService.findById(id);
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    return resOK(post);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePostDto, @Req() req: any) {
    const userId = req.user?._id || req.user?.id;
    return resOK(await this.postService.update(id, dto, userId));
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?._id || req.user?.id;
    return resOK(await this.postService.delete(id, userId));
  }

  @Post(':id/like')
  async likePost(@Param('id') postId: string, @Req() req: any) {
    const userId = req.user?._id || req.user?.id;
    return resOK(await this.postService.likePost(postId, userId));
  }

  @Post(':id/share')
  async sharePost(@Param('id') postId: string) {
    return resOK(await this.postService.sharePost(postId));
  }

  @Get(':id/comments')
  async listComments(@Param('id') postId: string, @Query() query: any) {
    return resOK(await this.postService.listComments(postId, query));
  }

  @Post(':id/comments')
  async addComment(@Param('id') postId: string, @Body() body: any, @Req() req: any) {
    return resOK(await this.postService.addComment(postId, req.user, body));
  }

  @Delete(':id/comments/:commentId')
  async deleteComment(
    @Param('id') postId: string,
    @Param('commentId') commentId: string,
    @Req() req: any,
  ) {
    const userId = req.user?._id?.toString() || req.user?.id?.toString();
    return resOK(await this.postService.deleteComment(postId, commentId, userId));
  }
}
