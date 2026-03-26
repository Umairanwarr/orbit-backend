import {
  Body,
  BadRequestException,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VerifiedAuthGuard } from '../../core/guards/verified.auth.guard';
import { V1Controller } from '../../core/common/v1-controller.decorator';
import { resOK } from '../../core/utils/res.helpers';
import { ArticlesService } from './articles.service';
import { ArticleReportService } from './article_report.service';

@UseGuards(VerifiedAuthGuard)
@V1Controller('articles')
export class ArticlesController {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly articleReportService: ArticleReportService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 500 * 1024 * 1024,
        fieldSize: 500 * 1024 * 1024,
      },
    }),
  )
  async create(@Req() req: any, @UploadedFile() file: Express.Multer.File, @Body() body: any) {
    const doc = await this.articlesService.createArticle(req.user, file, body);
    return resOK(doc);
  }

  @Get()
  async list(@Req() req: any, @Query() query: any) {
    try {
      if (req?.user?._id) {
        query.userId = req.user._id.toString();
      }
    } catch (_) {}
    const data = await this.articlesService.list(query);
    return resOK(data);
  }

  @Post(':id/like')
  async toggleLike(@Req() req: any) {
    const id = (req.params && req.params.id) as string;
    const res = await this.articlesService.toggleLike(req.user, id);
    return resOK(res);
  }

  @Get(':id/comments')
  async listComments(@Req() req: any, @Query() query: any) {
    const id = (req.params && req.params.id) as string;
    const data = await this.articlesService.listComments(id, query);
    return resOK(data);
  }

  @Post(':id/comments')
  async addComment(@Req() req: any, @Body() body: any) {
    const id = (req.params && req.params.id) as string;
    const data = await this.articlesService.addComment(req.user, id, body);
    return resOK(data);
  }

  @Delete(':id/comments/:commentId')
  async deleteComment(@Req() req: any, @Param('id') id: string, @Param('commentId') commentId: string) {
    const data = await this.articlesService.deleteComment(req.user, id, commentId);
    return resOK(data);
  }

  @Post(':id/support')
  async support(@Req() req: any) {
    const id = (req.params && req.params.id) as string;
    const res = await this.articlesService.initiateSupport(req.user, id, req.body || {});
    return resOK(res);
  }

  @Delete(':id')
  async deleteArticle(@Req() req: any, @Param('id') id: string) {
    const data = await this.articlesService.deleteArticle(req.user, id);
    return resOK(data);
  }

  @Post(':id/report')
  async report(@Req() req: any, @Param('id') id: string, @Body('content') content: string) {
    const art = await this.articlesService.getArticleByIdOrThrow(id);
    const uploaderId = (art as any).uploaderId?.toString?.() ?? '';
    if (uploaderId && uploaderId === req.user?._id?.toString?.()) {
      throw new BadRequestException('You cannot report your own article');
    }
    const report = await this.articleReportService.upsertUserReport({
      userId: req.user._id,
      articleId: id,
      content,
    });
    return resOK(report);
  }
}
