import { Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { V1Controller } from '../../../core/common/v1-controller.decorator';
import { resOK } from '../../../core/utils/res.helpers';
import { MongoIdDto } from '../../../core/common/dto/mongo.id.dto';
import { StoryService } from './story.service';
import { UserService } from '../../user_modules/user/user.service';
import { StoryType } from '../../../core/utils/enums';

@V1Controller('public/stories')
export class StoryPublicController {
  constructor(
    private readonly storyService: StoryService,
    private readonly userService: UserService,
  ) {}

  @Get(':id')
  async getPublicStory(@Param() dto: MongoIdDto) {
    const story: any = await this.storyService.findByIdOrThrow(dto.id);

    const user: any = await this.userService.findByIdOrThrow(
      story.userId?.toString?.() ?? story.userId,
      'fullName userImage',
    );

    const att: any = story.att || {};

    const url = (att.url || '').toString();
    const thumbUrl = (att.thumbUrl || att.thumbImage?.url || '').toString();
    const mimeType = (att.mimeType || '').toString();

    const storyType = (story.storyType || '').toString();

    let mediaUrl: string | null = null;
    let thumbnailUrl: string | null = null;

    if (storyType === StoryType.Image || storyType === StoryType.Video || storyType === StoryType.Voice || storyType === StoryType.File) {
      mediaUrl = url || null;
      if (storyType === StoryType.Image) {
        thumbnailUrl = url || null;
      } else if (storyType === StoryType.Video) {
        thumbnailUrl = thumbUrl || null;
      } else {
        thumbnailUrl = thumbUrl || null;
      }
    }

    const title = (story.caption || '').toString().trim() || 'Shared Story';

    return resOK({
      _id: story._id,
      title,
      caption: story.caption ?? null,
      storyType: story.storyType,
      content: story.content ?? null,
      backgroundColor: story.backgroundColor ?? null,
      textColor: story.textColor ?? null,
      textAlign: story.textAlign ?? null,
      fontType: story.fontType ?? null,
      mediaUrl,
      thumbnailUrl,
      mimeType,
      uploaderName: (user.fullName || '').toString(),
      uploaderImage: (user.userImage || '').toString(),
      createdAt: story.createdAt ?? null,
      expireAt: story.expireAt ?? null,
    });
  }

  @Get('share/:id')
  async getStorySharePage(@Param() dto: MongoIdDto, @Res() res: Response) {
    const body: any = await this.getPublicStory(dto);
    const data: any = body?.data ?? body;

    const title = (data.title || 'Shared Story').toString();
    const uploaderName = (data.uploaderName || 'Orbit').toString();
    const description = `Shared by ${uploaderName} on Orbit`;
    const thumbnailUrl = (data.thumbnailUrl || data.uploaderImage || '').toString();
    const pageUrl = `https://api.orbit.ke/story-share.html?id=${dto.id}`;
    const imageUrl = thumbnailUrl.startsWith('http')
      ? thumbnailUrl
      : thumbnailUrl
        ? `https://api.orbit.ke${thumbnailUrl.startsWith('/') ? '' : '/'}${thumbnailUrl}`
        : '';

    const mediaUrlRaw = (data.mediaUrl || '').toString();
    const mediaUrl = mediaUrlRaw.startsWith('http')
      ? mediaUrlRaw
      : mediaUrlRaw
        ? `https://api.orbit.ke${mediaUrlRaw.startsWith('/') ? '' : '/'}${mediaUrlRaw}`
        : '';

    const ogVideo =
      data.storyType === StoryType.Video && mediaUrl
        ? `<meta property="og:video" content="${this._escapeHtml(mediaUrl)}" />\n  <meta property="og:video:type" content="${this._escapeHtml(data.mimeType || 'video/mp4')}" />`
        : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Orbit | ${this._escapeHtml(title)}</title>
  <meta name="description" content="${this._escapeHtml(description)}" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${this._escapeHtml(title)}" />
  <meta property="og:description" content="${this._escapeHtml(description)}" />
  ${imageUrl ? `<meta property="og:image" content="${this._escapeHtml(imageUrl)}" />` : ''}
  <meta property="og:url" content="${this._escapeHtml(pageUrl)}" />
  <meta property="og:site_name" content="Orbit" />
  ${ogVideo}

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${this._escapeHtml(title)}" />
  <meta name="twitter:description" content="${this._escapeHtml(description)}" />
  ${imageUrl ? `<meta name="twitter:image" content="${this._escapeHtml(imageUrl)}" />` : ''}

  <meta http-equiv="refresh" content="0; url=${this._escapeHtml(pageUrl)}" />
</head>
<body>
  <p>Redirecting...</p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(html);
  }

  private _escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
