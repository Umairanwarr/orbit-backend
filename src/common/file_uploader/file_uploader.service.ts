/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import path from "path";
import root from "app-root-path";
import fs from "fs";
import { S3UploaderTypes } from "../../core/utils/enums";
import { cropProfileImage } from "../../core/utils/sharp.utils";
import { v4 as uuidv4 } from "uuid";
import { CreateS3UploaderDto } from "./create-s3_uploader.dto";
import { v2 as cloudinary } from "cloudinary";

@Injectable()
export class FileUploaderService {

  private cloudinaryEnabled = false;
  private cloudinaryBaseFolder = 'orbit';

  constructor(private readonly config: ConfigService) {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME') || process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY') || process.env.CLOUDINARY_API_KEY;
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET') || process.env.CLOUDINARY_API_SECRET;
    const folder = this.config.get<string>('CLOUDINARY_FOLDER') || process.env.CLOUDINARY_FOLDER;
    if (folder) {
      this.cloudinaryBaseFolder = folder;
    }
    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.cloudinaryEnabled = true;
    }
  }


  async putImageCropped(imageBuffer: Buffer, myId: string) {
    if (!this.cloudinaryEnabled) {
      throw new InternalServerErrorException('Cloudinary is not configured');
    }
    void myId;
    const image = await cropProfileImage(imageBuffer);
    const publicId = `${S3UploaderTypes.profileImage}-${uuidv4()}`;
    const url = await this._uploadToCloudinary(image, {
      folder: `${this.cloudinaryBaseFolder}/v-public`,
      publicId,
      resourceType: 'image',
      format: 'jpg',
    });
    return url;
  }

  async uploadChatMedia(dto: CreateS3UploaderDto) {
    if (!this.cloudinaryEnabled) {
      throw new InternalServerErrorException('Cloudinary is not configured');
    }

    const publicId = `${S3UploaderTypes.media}-${uuidv4()}`;
    const url = await this._uploadToCloudinary(dto.mediaBuffer, {
      folder: `${this.cloudinaryBaseFolder}/media/${dto.myUser._id}`,
      publicId,
      resourceType: 'auto',
    });
    return url;
  }

  async deleteByUrl(mediaUrl: string) {
    try {
      if (!mediaUrl) return;

      const isCloudinaryPath = mediaUrl.startsWith('/') && mediaUrl.includes('/upload/');
      const cloudinaryUrl = isCloudinaryPath ? `https://res.cloudinary.com${mediaUrl}` : mediaUrl;

      if (this.cloudinaryEnabled && (this._isCloudinaryUrl(mediaUrl) || isCloudinaryPath)) {
        const publicId = this._extractCloudinaryPublicId(cloudinaryUrl);
        if (!publicId) return;
        const resourceTypes: Array<'image' | 'video' | 'raw'> = ['image', 'video', 'raw'];
        for (const rt of resourceTypes) {
          try {
            const res: any = await cloudinary.uploader.destroy(publicId, { resource_type: rt, invalidate: true } as any);
            if (res?.result === 'ok') return;
          } catch (_) {}
        }
        return;
      }

      const pathname = mediaUrl.startsWith('http') ? new URL(mediaUrl).pathname : mediaUrl;
      if (pathname.startsWith('/media/')) {
        const key = pathname.replace('/media/', '');
        const filePath = path.join(root.path, 'public', 'media', key);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        return;
      }
      if (pathname.startsWith('/v-public/')) {
        const key = pathname.replace('/v-public/', '');
        const filePath = path.join(root.path, 'public', 'v-public', key);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        return;
      }

      if (!pathname.startsWith('/') && pathname.includes('/')) {
        const filePath = path.join(root.path, 'public', 'media', pathname);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        return;
      }
    } catch (_) {}
  }

  async _putFile(fileData: Buffer, key:string, userId: string, isPublic?: boolean) {
    void fileData;
    void key;
    void userId;
    void isPublic;
    throw new InternalServerErrorException('Local media storage is disabled');
  }

  private async _uploadToCloudinary(
    buffer: Buffer,
    opts: { folder: string; publicId: string; resourceType: 'auto' | 'image' | 'video' | 'raw'; format?: string },
  ): Promise<string> {
    return await new Promise((resolve, reject) => {
      const useLarge = buffer && buffer.length > 20 * 1024 * 1024;
      const uploaderAny: any = cloudinary.uploader as any;
      const method = useLarge && typeof uploaderAny.upload_large_stream === 'function'
        ? uploaderAny.upload_large_stream
        : cloudinary.uploader.upload_stream;

      const stream = method(
        {
          folder: opts.folder,
          public_id: opts.publicId,
          resource_type: opts.resourceType as any,
          overwrite: false,
          unique_filename: false,
          ...(useLarge ? { chunk_size: 6 * 1024 * 1024 } : {}),
          ...(opts.format ? { format: opts.format } : {}),
        } as any,
        (error: any, result: any) => {
          if (error) return reject(error);
          return resolve(result?.secure_url || result?.url);
        },
      );
      stream.end(buffer);
    });
  }

  private _isCloudinaryUrl(url: string): boolean {
    try {
      return url.includes('res.cloudinary.com');
    } catch (_) {
      return false;
    }
  }

  private _extractCloudinaryPublicId(url: string): string | null {
    try {
      const u = url.startsWith('http') ? new URL(url) : new URL(`https://res.cloudinary.com${url}`);
      const pathname = u.pathname || '';
      const parts = pathname.split('/upload/');
      if (parts.length < 2) return null;
      let tail = parts[1].replace(/^\/+/, '');

      const anchor = `${this.cloudinaryBaseFolder}/`;
      const anchorIndex = tail.indexOf(anchor);
      if (anchorIndex >= 0) {
        tail = tail.substring(anchorIndex);
      } else {
        const segs = tail.split('/').filter(Boolean);
        const vIndex = segs.findIndex((s) => /^v\d+$/.test(s));
        if (vIndex >= 0) {
          tail = segs.slice(vIndex + 1).join('/');
        }
      }

      while (true) {
        const segs = tail.split('/').filter(Boolean);
        if (segs.length === 0) break;
        const first = segs[0];
        const looksLikeTransform =
          first.includes(',') ||
          first.startsWith('c_') ||
          first.startsWith('w_') ||
          first.startsWith('h_') ||
          first.startsWith('q_') ||
          first.startsWith('f_') ||
          first.startsWith('g_') ||
          first.startsWith('e_') ||
          first.startsWith('t_') ||
          first.startsWith('fl_');
        if (!looksLikeTransform) break;
        tail = segs.slice(1).join('/');
      }

      tail = tail.replace(/\.[^./]+$/, '');
      return tail || null;
    } catch (_) {
      return null;
    }
  }
}