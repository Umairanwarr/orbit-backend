import {
  Body,
  BadRequestException,
  Delete,
  Get,
  Post,
  Query,
  Req,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VerifiedAuthGuard } from '../../core/guards/verified.auth.guard';
import { V1Controller } from '../../core/common/v1-controller.decorator';
import { resOK } from '../../core/utils/res.helpers';
import { MusicService } from './music.service';
import { MusicReportService } from './music_report.service';

@UseGuards(VerifiedAuthGuard)
@V1Controller('music')
export class MusicController {
  constructor(
    private readonly musicService: MusicService,
    private readonly musicReportService: MusicReportService,
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
    const doc = await this.musicService.createMusic(req.user, file, body);
    return resOK(doc);
  }

  @Get()
  async list(@Req() req: any, @Query() query: any) {
    try {
      if (req?.user?._id) {
        query.userId = req.user._id.toString();
      }
    } catch (_) {}
    const data = await this.musicService.list(query);
    return resOK(data);
  }

  @Get('artists')
  async getArtists() {
    const artists = await this.musicService.getArtists();
    return resOK(artists);
  }

  @Post(':id/like')
  async toggleLike(@Req() req: any) {
    const id = (req.params && req.params.id) as string;
    const res = await this.musicService.toggleLike(req.user, id);
    return resOK(res);
  }

  @Get(':id/comments')
  async listComments(@Req() req: any, @Query() query: any) {
    const id = (req.params && req.params.id) as string;
    const data = await this.musicService.listComments(id, query);
    return resOK(data);
  }

  @Post(':id/comments')
  async addComment(@Req() req: any, @Body() body: any) {
    const id = (req.params && req.params.id) as string;
    const data = await this.musicService.addComment(req.user, id, body);
    return resOK(data);
  }

  @Delete(':id/comments/:commentId')
  async deleteComment(@Req() req: any, @Param('id') id: string, @Param('commentId') commentId: string) {
    const data = await this.musicService.deleteComment(req.user, id, commentId);
    return resOK(data);
  }

  @Delete(':id')
  async deleteMusic(@Req() req: any, @Param('id') id: string) {
    const data = await this.musicService.deleteMusic(req.user, id);
    return resOK(data);
  }

  @Post(':id/play')
  async incrementPlay(@Req() req: any) {
    // id is already in req.params.id via Express, but Nest's typed decorators aren't used here
    const id = (req.params && req.params.id) as string;
    const doc = await this.musicService.incrementPlays(req.user, id);
    return resOK(doc);
  }

  @Post(':id/support')
  async support(@Req() req: any) {
    const id = (req.params && req.params.id) as string;
    const res = await this.musicService.initiateSupport(req.user, id, req.body || {});
    return resOK(res);
  }

  @Post(':id/report')
  async report(@Req() req: any, @Param('id') id: string, @Body('content') content: string) {
    const music = await this.musicService.getMusicByIdOrThrow(id);
    const uploaderId = (music as any).uploaderId?.toString?.() ?? '';
    if (uploaderId && uploaderId === req.user?._id?.toString?.()) {
      throw new BadRequestException('You cannot report your own music');
    }
    const report = await this.musicReportService.upsertUserReport({
      userId: req.user._id,
      musicId: id,
      content,
    });
    return resOK(report);
  }
}
