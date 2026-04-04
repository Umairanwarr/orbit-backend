import {
  Body,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  UploadedFiles,
  Param,
  Get,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import { PostService } from "./post.service";
import { VerifiedAuthGuard } from "src/core/guards/verified.auth.guard";
import { V1Controller } from "src/core/common/v1-controller.decorator";
import { CreatePostDto } from "./dto/create-post.dto";
import { CreateCommentDto } from "./dto/create-comment.dto";

@UseGuards(VerifiedAuthGuard)
@V1Controller("posts")
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Post("single")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: 500 * 1024 * 1024,
        fieldSize: 500 * 1024 * 1024,
      },
    }),
  )
  async create(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CreatePostDto,
  ) {
    if (!file) {
      throw new BadRequestException("File is required");
    }

    const doc = await this.postService.createSingleMediaPost(
      req.user,
      file,
      body,
    );

    // Assuming resOK is a global utility in your project like in the music module
    // return resOK(doc);

    return {
      success: true,
      data: doc,
    };
  }

  @Post("carousel")
  @UseInterceptors(
    FilesInterceptor("files", 10, {
      limits: {
        fileSize: 50 * 1024 * 1024,
      },
    }),
  )
  async createCarousel(
    @Req() req: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body() body: CreatePostDto, // <-- Applied DTO here
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException("Files are required");
    }

    const doc = await this.postService.createCarouselPost(
      req.user,
      files,
      body,
    );

    return {
      success: true,
      data: doc,
    };
  }

  @Post(":id/like")
  async toggleLike(@Req() req: any, @Param("id") postId: string) {
    if (!postId) {
      throw new BadRequestException("Post ID is required");
    }

    const result = await this.postService.toggleLike(req.user, postId);

    return {
      success: true,
      data: result,
    };
  }

  @Post(":id/comments")
  async addComment(
    @Req() req: any,
    @Param("id") postId: string,
    @Body() body: CreateCommentDto,
  ) {
    if (!postId) {
      throw new BadRequestException("Post ID is required");
    }

    const doc = await this.postService.addComment(req.user, postId, body);

    return {
      success: true,
      data: doc,
    };
  }

  @Get("feed")
  async getFeed(
    @Req() req: any,
    @Query("cursor") cursor?: string,
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit?: number,
  ) {
    const safeLimit = limit > 50 ? 50 : limit;

    const result = await this.postService.getFeedPosts(
      req.user,
      cursor,
      safeLimit,
    );

    return {
      success: true,
      data: result,
    };
  }
}
