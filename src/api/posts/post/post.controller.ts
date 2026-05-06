import {
  Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, Req, UseInterceptors, UploadedFiles, BadRequestException, NotFoundException,
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

@V1Controller('posts')
@UseGuards(VerifiedAuthGuard)
export class PostController {
  constructor(
    private readonly postService: PostService,
    private readonly fileUploaderService: FileUploaderService,
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
    const currentUserId = req.user?._id?.toString() || req.user?.id?.toString();
    return resOK(await this.postService.findReels(page, limit, currentUserId));
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
