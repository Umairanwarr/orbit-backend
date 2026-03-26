import { Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { V1Controller } from '../../core/common/v1-controller.decorator';
import { MongoIdDto } from '../../core/common/dto/mongo.id.dto';
import { JobsService } from './jobs.service';

@V1Controller('public/jobs')
export class JobsPublicController {
  constructor(private readonly jobsService: JobsService) {}

  @Get(':id')
  async getPublicJob(@Param() dto: MongoIdDto) {
    return await this.jobsService.getPublicJob(dto.id);
  }

  @Get('share/:id')
  async getJobSharePage(@Param() dto: MongoIdDto, @Res() res: Response) {
    const data = await this.jobsService.getPublicJob(dto.id);
    
    const title = data.title || 'Job Opportunity';
    const companyName = data.posterName || 'Orbit';
    const description = data.description ? data.description.substring(0, 200) : 'View this job on Orbit';
    const pageUrl = `https://api.orbit.ke/job-share.html?id=${dto.id}`;
    const imageUrl = data.posterImage
      ? (data.posterImage.startsWith('http') ? data.posterImage : `https://api.orbit.ke${data.posterImage}`)
      : 'https://api.orbit.ke/v-public/default_user_image.png';
    
    const salaryRange = this._formatSalary(data.salaryMin, data.salaryMax);
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Orbit | ${this._escapeHtml(title)}</title>
  <meta name="description" content="${this._escapeHtml(description)}" />
  
  <!-- Open Graph / Facebook / WhatsApp -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${this._escapeHtml(title)}" />
  <meta property="og:description" content="${this._escapeHtml(description)}" />
  <meta property="og:image" content="${this._escapeHtml(imageUrl)}" />
  <meta property="og:image:width" content="640" />
  <meta property="og:image:height" content="360" />
  <meta property="og:url" content="${this._escapeHtml(pageUrl)}" />
  <meta property="og:site_name" content="Orbit Jobs" />
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${this._escapeHtml(title)}" />
  <meta name="twitter:description" content="${this._escapeHtml(description)}" />
  <meta name="twitter:image" content="${this._escapeHtml(imageUrl)}" />
  
  <style>
    :root {
      --bg: #0f1115;
      --card: #161922;
      --text: #e7e7ea;
      --muted: #a7a7ad;
      --brand: #b48648;
      --accent: #4a90d9;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
    .wrap { min-height: 100%; display: grid; place-items: center; padding: 24px; }
    .card { width: 100%; max-width: 640px; background: var(--card); border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,.4); overflow: hidden; }
    .header { padding: 20px; display: flex; align-items: center; gap: 14px; border-bottom: 1px solid rgba(255,255,255,.08); }
    .logo { width: 36px; height: 36px; border-radius: 8px; background: var(--brand); display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 18px; }
    .title { font-size: 20px; font-weight: 700; line-height: 1.3; }
    .meta { display:flex; align-items:center; gap:10px; margin-top:6px; }
    .avatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; background: rgba(255,255,255,.08); }
    .company { color: var(--brand); font-size: 14px; font-weight: 600; }
    
    .content { padding: 20px; }
    .tag-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .tag { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: rgba(255,255,255,.06); border-radius: 20px; font-size: 13px; color: var(--muted); }
    .tag svg { width: 14px; height: 14px; }
    .tag.salary { background: rgba(74,144,217,.15); color: var(--accent); }
    
    .section { margin-bottom: 16px; }
    .section-title { font-size: 13px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; }
    .section-text { font-size: 14px; line-height: 1.6; color: var(--text); white-space: pre-wrap; }
    
    .app-links { margin-top: 20px; text-align: center; padding: 20px; border-top: 1px solid rgba(255,255,255,.08); }
    .app-links a { display: inline-block; margin: 6px; padding: 12px 24px; background: var(--brand); color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; }
    .app-links a.secondary { background: rgba(255,255,255,.1); }
    
    .footer { padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; border-top: 1px solid rgba(255,255,255,.08); }
    .links a { color: var(--muted); text-decoration: none; font-size: 13px; margin-right: 14px; }
    .links a:hover { color: var(--text); }
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
          <img class="avatar" src="${this._escapeHtml(imageUrl)}" alt="" onerror="this.style.display='none'" />
          <div class="company">${this._escapeHtml(companyName)}</div>
        </div>
      </div>
    </div>

    <div class="content">
      <div class="tag-row">
        <span class="tag">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          ${this._escapeHtml(data.location)}
        </span>
        <span class="tag">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          ${this._escapeHtml(data.category)}
        </span>
        ${salaryRange ? `<span class="tag salary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          ${this._escapeHtml(salaryRange)}
        </span>` : ''}
      </div>
      
      <div class="section">
        <div class="section-title">Description</div>
        <div class="section-text">${this._escapeHtml(data.description || 'No description provided')}</div>
      </div>
      
      ${data.qualifications ? `<div class="section">
        <div class="section-title">Qualifications</div>
        <div class="section-text">${this._escapeHtml(data.qualifications)}</div>
      </div>` : ''}
    </div>

    <div class="app-links">
      <a href="https://play.google.com/store/apps/details?id=com.orbit.ke" target="_blank" rel="noopener">Get Android App</a>
      <a href="https://apps.apple.com/us/app/orbit-chats/id6749538035" target="_blank" rel="noopener">Get iOS App</a>
      <a href="https://orbit.ke/" target="_blank" rel="noopener" class="secondary">Open in Web</a>
    </div>

    <div class="footer">
      <div class="links">
        <a href="https://orbit.ke/" target="_blank" rel="noopener">Orbit Web</a>
        <a href="https://play.google.com/store/apps/details?id=com.orbit.ke" target="_blank" rel="noopener">Android App</a>
        <a href="https://apps.apple.com/us/app/orbit-chats/id6749538035" target="_blank" rel="noopener">iOS App</a>
      </div>
    </div>
  </div>
</div>
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

  private _formatSalary(min?: number | null, max?: number | null): string {
    if (!min && !max) return '';
    const formatNum = (n: number) => {
      if (n >= 1000000) return `KES ${(n / 1000000).toFixed(1)}M`;
      if (n >= 1000) return `KES ${(n / 1000).toFixed(0)}K`;
      return `KES ${n.toLocaleString()}`;
    };
    if (min && max) return `KES ${min.toLocaleString()} - ${max.toLocaleString()}`;
    if (min) return `From ${formatNum(min)}`;
    if (max) return `Up to ${formatNum(max)}`;
    return '';
  }
}
