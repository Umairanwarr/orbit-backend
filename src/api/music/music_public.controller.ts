import { Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { V1Controller } from '../../core/common/v1-controller.decorator';
import { resOK } from '../../core/utils/res.helpers';
import { MongoIdDto } from '../../core/common/dto/mongo.id.dto';
import { MusicService } from './music.service';

@V1Controller('public/music')
export class MusicPublicController {
  constructor(private readonly musicService: MusicService) {}

  @Get(':id')
  async getPublicMusic(@Param() dto: MongoIdDto) {
    return resOK(await this.musicService.getPublicMusic(dto.id));
  }

  @Get('share/:id')
  async getMusicSharePage(@Param() dto: MongoIdDto, @Res() res: Response) {
    const data = await this.musicService.getPublicMusic(dto.id);
    
    const title = data.title || 'Shared Content';
    const uploaderName = data.uploaderName || 'Orbit';
    const description = `Shared by ${uploaderName} on Orbit`;
    const thumbnailUrl = data.thumbnailUrl || '';
    const pageUrl = `https://api.orbit.ke/music-share.html?id=${dto.id}`;
    const imageUrl = thumbnailUrl.startsWith('http') ? thumbnailUrl : `https://api.orbit.ke${thumbnailUrl}`;
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Orbit | ${this._escapeHtml(title)}</title>
  <meta name="description" content="${this._escapeHtml(description)}" />
  
  <!-- Open Graph / Facebook / WhatsApp -->
  <meta property="og:type" content="video.other" />
  <meta property="og:title" content="${this._escapeHtml(title)}" />
  <meta property="og:description" content="${this._escapeHtml(description)}" />
  <meta property="og:image" content="${this._escapeHtml(imageUrl)}" />
  <meta property="og:image:width" content="640" />
  <meta property="og:image:height" content="360" />
  <meta property="og:url" content="${this._escapeHtml(pageUrl)}" />
  <meta property="og:site_name" content="Orbit" />
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${this._escapeHtml(title)}" />
  <meta name="twitter:description" content="${this._escapeHtml(description)}" />
  <meta name="twitter:image" content="${this._escapeHtml(imageUrl)}" />
  
  <!-- Video specific (if video) -->
  ${data.mediaType === 'video' ? `<meta property="og:video" content="${this._escapeHtml(data.playUrl || data.mediaUrl)}" />
  <meta property="og:video:type" content="${this._escapeHtml(data.mimeType || 'video/mp4')}" />` : ''}
  
  <style>
    :root {
      --bg: #0f1115;
      --card: #161922;
      --text: #e7e7ea;
      --muted: #a7a7ad;
      --brand: #b48648;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
    .wrap { min-height: 100%; display: grid; place-items: center; padding: 24px; }
    .card { width: 100%; max-width: 920px; background: var(--card); border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,.4); overflow: hidden; }
    .header { padding: 16px 20px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid rgba(255,255,255,.08); }
    .logo { width: 28px; height: 28px; border-radius: 6px; background: var(--brand); display: grid; place-items: center; color: #fff; font-weight: 800; }
    .title { font-size: 16px; font-weight: 700; line-height: 1.2; }
    .meta { display:flex; align-items:center; gap:10px; margin-top:4px; }
    .avatar { width: 20px; height: 20px; border-radius: 6px; object-fit: cover; background: rgba(255,255,255,.08); }
    .uploader { color: var(--brand); font-size: 13px; font-weight: 600; }

    .player { position: relative; background: #0a0b0f; display: block; width: 100%; }
    .poster { position: absolute; inset: 0; background: #0a0b0f center/cover no-repeat; display: grid; place-items: center; z-index: 2; }
    .playBtn { background: var(--brand); color: #fff; border: 0; padding: 12px 18px; border-radius: 24px; font-weight: 700; font-size: 14px; cursor: pointer; box-shadow: 0 6px 16px rgba(180,134,72,.35); }
    .playBtn[disabled] { background: #3b3f4b; cursor: not-allowed; box-shadow: none; }

    video, audio { width: 100%; display: none; background: #000; position: relative; z-index: 1; }
    video { aspect-ratio: 16/9; }
    audio { padding: 18px 20px; background: #0a0b0f; }

    .footer { padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .links a { color: var(--muted); text-decoration: none; font-size: 13px; margin-right: 14px; }
    .links a:hover { color: var(--text); }
    .notice { color: #ffd166; font-size: 13px; }
    .app-links { margin-top: 20px; text-align: center; }
    .app-links a { display: inline-block; margin: 8px; padding: 12px 24px; background: var(--brand); color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="header">
      <div class="logo">O</div>
      <div>
        <div class="title">${this._escapeHtml(title)}</div>
        <div class="meta">
          <img class="avatar" src="${this._escapeHtml(data.uploaderImage || '')}" alt="" onerror="this.style.display='none'" />
          <div class="uploader">${this._escapeHtml(uploaderName)}</div>
        </div>
      </div>
    </div>

    <div class="player" id="player">
      <div class="poster" id="poster" style="background-image: url('${this._escapeHtml(thumbnailUrl)}')">
        <button class="playBtn" id="playBtn">Play</button>
      </div>
      <video id="video" controls playsinline preload="metadata"></video>
      <audio id="audio" controls preload="metadata"></audio>
    </div>

    <div class="app-links">
      <a href="https://play.google.com/store/apps/details?id=com.orbit.ke" target="_blank" rel="noopener">Get Android App</a>
      <a href="https://apps.apple.com/us/app/orbit-chats/id6749538035" target="_blank" rel="noopener">Get iOS App</a>
      <a href="https://orbit.ke/" target="_blank" rel="noopener">Open in Web</a>
    </div>

    <div class="footer">
      <div class="links">
        <a href="https://orbit.ke/" target="_blank" rel="noopener">Orbit Web</a>
        <a href="https://play.google.com/store/apps/details?id=com.orbit.ke" target="_blank" rel="noopener">Android App</a>
        <a href="https://apps.apple.com/us/app/orbit-chats/id6749538035" target="_blank" rel="noopener">iOS App</a>
      </div>
      <div class="notice" id="notice"></div>
    </div>
  </div>
</div>

<script>
(function() {
  const data = ${JSON.stringify(data)};
  const posterEl = document.getElementById('poster');
  const playBtn = document.getElementById('playBtn');
  const videoEl = document.getElementById('video');
  const audioEl = document.getElementById('audio');
  const noticeEl = document.getElementById('notice');

  const makeAbsolute = (p) => {
    if (!p) return '';
    if (/^https?:\\/\\//i.test(p)) return p;
    const path = p.startsWith('/') ? p : \`/\${p}\`;
    return \`\${location.origin}\${path}\`;
  };

  const normalizeUrl = (u) => {
    if (!u) return '';
    if (u.startsWith('http://')) return \`https://\${u.substring('http://'.length)}\`;
    return u;
  };

  const isAudio = data.mediaType === 'audio' || (data.mimeType || '').startsWith('audio/');
  const isVideo = data.mediaType === 'video' || (data.mimeType || '').startsWith('video/');

  if (isVideo) {
    const playUrl = normalizeUrl(makeAbsolute(data.playUrl || data.mediaUrl || ''));
    if (playUrl) {
      videoEl.src = playUrl;
      playBtn.onclick = () => {
        posterEl.style.display = 'none';
        videoEl.style.display = 'block';
        videoEl.play().catch(() => {});
      };
    } else {
      playBtn.disabled = true;
      noticeEl.textContent = 'Video unavailable';
    }
  } else if (isAudio) {
    const audioUrl = normalizeUrl(makeAbsolute(data.mediaUrl || ''));
    if (audioUrl) {
      audioEl.src = audioUrl;
      posterEl.style.backgroundImage = \`url('${this._escapeHtml(thumbnailUrl)}')\`;
      playBtn.onclick = () => {
        posterEl.style.display = 'none';
        audioEl.style.display = 'block';
        audioEl.play().catch(() => {});
      };
    } else {
      playBtn.disabled = true;
      noticeEl.textContent = 'Audio unavailable';
    }
  } else {
    playBtn.disabled = true;
    noticeEl.textContent = 'Content unavailable';
  }
})();
</script>
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
