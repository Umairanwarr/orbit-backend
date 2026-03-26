import { Controller, Get, Req, Res, Param } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';

@Controller()
export class MediaProxyController {
  constructor(private readonly config: ConfigService) {}

  // Redirects /recordings/<key> to a signed Alibaba OSS URL
  @Get('recordings/:key(*)')
  async redirectRecording(@Param('key') key: string, @Req() req: Request, @Res() res: Response) {
    const wildcard = key;
    if (!wildcard || wildcard.length === 0) {
      return res.status(404).send('Not found');
    }

    // Build the OSS object key: route provides the part AFTER 'recordings/'
    // Normalize: remove any leading '/'
    const tail = decodeURIComponent(wildcard).replace(/^\/+/, '');
    const objectKey = tail.startsWith('recordings/') ? tail : `recordings/${tail}`;
    // console.debug('Signing OSS object key:', objectKey);

    // Build a signed URL for Alibaba OSS
    const vendor = Number(this.config.get('AGORA_STORAGE_VENDOR'));
    if (vendor !== 2) {
      // Only Alibaba OSS signing is implemented here
      return res.status(400).send('Storage vendor not supported for proxy');
    }

    const bucket = this.config.get<string>('AGORA_STORAGE_BUCKET');
    const accessKeyId = this.config.get<string>('AGORA_STORAGE_ACCESS_KEY');
    const accessKeySecret = this.config.get<string>('AGORA_STORAGE_SECRET_KEY');
    const regionNum = Number(this.config.get('AGORA_STORAGE_REGION'));

    if (!bucket || !accessKeyId || !accessKeySecret || Number.isNaN(regionNum)) {
      return res.status(500).send('Storage configuration missing');
    }

    const regionCode = this.mapAliRegion(regionNum);
    if (!regionCode) {
      return res.status(500).send('Invalid OSS region');
    }

    const signed = this.signAliOssGetUrl({
      bucket,
      key: objectKey,
      accessKeyId,
      accessKeySecret,
      region: regionCode,
      expiresInSeconds: 3600,
    });

    return res.redirect(302, signed);
  }

  // Streams the recording through this server to avoid client-side CORS issues
  @Get('play/recordings/:key(*)')
  async streamRecording(@Param('key') key: string, @Req() req: Request, @Res() res: Response) {
    const wildcard = key;
    if (!wildcard || wildcard.length === 0) {
      return res.status(404).send('Not found');
    }

    const tail = decodeURIComponent(wildcard).replace(/^\/+/,'');
    const objectKey = tail.startsWith('recordings/') ? tail : `recordings/${tail}`;

    const vendor = Number(this.config.get('AGORA_STORAGE_VENDOR'));
    if (vendor !== 2) {
      // Only Alibaba OSS implemented
      return res.status(400).send('Storage vendor not supported for proxy');
    }

    const bucket = this.config.get<string>('AGORA_STORAGE_BUCKET');
    const accessKeyId = this.config.get<string>('AGORA_STORAGE_ACCESS_KEY');
    const accessKeySecret = this.config.get<string>('AGORA_STORAGE_SECRET_KEY');
    const regionNum = Number(this.config.get('AGORA_STORAGE_REGION'));

    if (!bucket || !accessKeyId || !accessKeySecret || Number.isNaN(regionNum)) {
      return res.status(500).send('Storage configuration missing');
    }

    const regionCode = this.mapAliRegion(regionNum);
    if (!regionCode) {
      return res.status(500).send('Invalid OSS region');
    }

    const signedUrl = this.signAliOssGetUrl({
      bucket,
      key: objectKey,
      accessKeyId,
      accessKeySecret,
      region: regionCode,
      expiresInSeconds: 3600,
    });

    try {
      const upstream = await axios.get(signedUrl, {
        responseType: 'stream',
        // Forward Range header for seeking/partial content
        headers: req.headers.range ? { Range: req.headers.range as string } : undefined,
        // Timeout to avoid hanging connections
        timeout: 15000,
        validateStatus: () => true,
      });

      // Propagate important headers
      const headersToCopy = ['content-type','content-length','content-range','accept-ranges','last-modified','etag','cache-control'];
      for (const h of headersToCopy) {
        const v = upstream.headers[h] as string | undefined;
        if (v) res.setHeader(h, v);
      }
      // Allow public consumption
      res.setHeader('Access-Control-Allow-Origin', '*');

      const status = upstream.status === 206 ? 206 : 200;
      res.status(status);
      upstream.data.pipe(res);
    } catch (e) {
      return res.status(502).send('Upstream fetch failed');
    }
  }

  private mapAliRegion(region: number): string | undefined {
    const m: Record<number, string> = {
      0: 'cn-hangzhou',
      1: 'cn-shanghai',
      2: 'cn-qingdao',
      3: 'cn-beijing',
      4: 'cn-zhangjiakou',
      5: 'cn-huhehaote',
      6: 'cn-shenzhen',
      7: 'cn-hongkong',
      8: 'us-west-1',
      9: 'us-east-1',
      10: 'ap-southeast-1',
      11: 'ap-southeast-2',
      12: 'ap-southeast-3',
      13: 'ap-southeast-5',
      14: 'ap-northeast-1',
      15: 'ap-south-1',
      16: 'eu-central-1',
      17: 'eu-west-1',
      18: 'eu-east-1',
      19: 'ap-southeast-6',
      20: 'cn-heyuan',
      21: 'cn-guangzhou',
      22: 'cn-chengdu',
      23: 'cn-nanjing',
      24: 'cn-fuzhou',
      25: 'cn-wulanchabu',
      26: 'cn-northeast-2',
      27: 'cn-southeast-7',
    };
    return m[region];
  }

  private signAliOssGetUrl(params: {
    bucket: string;
    key: string;
    accessKeyId: string;
    accessKeySecret: string;
    region: string; // e.g. 'us-east-1'
    expiresInSeconds?: number; // default 3600
  }): string {
    const { bucket, key, accessKeyId, accessKeySecret, region } = params;
    const expiresIn = params.expiresInSeconds ?? 3600;
    const expires = Math.floor(Date.now() / 1000) + expiresIn;

    // StringToSign = VERB + '\n' + Content-MD5 + '\n' + Content-Type + '\n' + Expires + '\n' + CanonicalizedOSSHeaders + CanonicalizedResource
    const canonicalizedResource = `/${bucket}/${key}`;
    const stringToSign = `GET\n\n\n${expires}\n${canonicalizedResource}`;
    const signature = crypto
      .createHmac('sha1', accessKeySecret)
      .update(stringToSign)
      .digest('base64');

    const endpoint = `https://${bucket}.oss-${region}.aliyuncs.com/${encodeURI(key)}`;
    const signed = `${endpoint}?OSSAccessKeyId=${encodeURIComponent(accessKeyId)}&Expires=${expires}&Signature=${encodeURIComponent(
      signature,
    )}`;
    return signed;
  }
}
