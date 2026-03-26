import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IMusic } from './music.entity';
import { FileUploaderService } from '../../common/file_uploader/file_uploader.service';
import { CreateS3UploaderDto } from '../../common/file_uploader/create-s3_uploader.dto';
import { IUser } from '../user_modules/user/entities/user.entity';
import { PesapalService } from '../payments/pesapal/pesapal.service';
import { UserRole } from '../../core/utils/enums';
import { VideoThumbnailUtil } from '../../core/utils/video-thumbnail.util';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import root from 'app-root-path';
import { MusicReportService } from './music_report.service';
import { NotificationEmitterService } from '../../common/notification_emitter/notification_emitter.service';
import { NotificationData } from '../../common/notification_emitter/notification.event';
import { UserFollowService } from '../user_modules/user_follow/user_follow.service';
import { UserDeviceService } from '../user_modules/user_device/user_device.service';
import { isUUID } from 'class-validator';
import { UserService } from '../user_modules/user/user.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MusicService {
  constructor(
    @InjectModel('Music') private readonly musicModel: Model<IMusic>,
    @InjectModel('MusicSupport') private readonly supportModel: Model<any>,
    @InjectModel('MusicComment') private readonly commentModel: Model<any>,
    private readonly fileUploader: FileUploaderService,
    private readonly pesapal: PesapalService,
    private readonly userService: UserService,
    private readonly musicReportService: MusicReportService,
    private readonly notificationEmitter: NotificationEmitterService,
    private readonly userFollowService: UserFollowService,
    private readonly userDeviceService: UserDeviceService,
  ) { }

  private _chunk<T>(arr: T[], size: number): T[][] {
    if (size <= 0) return [arr];
    const res: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      res.push(arr.slice(i, i + size));
    }
    return res;
  }

  private async _notifyFollowersOnNewVideo(params: { music: IMusic; uploader: IUser }) {
    const { music, uploader } = params;
    try {
      const uploaderId = ((uploader as any)?._id ?? '').toString();
      if (!uploaderId) return;

      const followDocs = await this.userFollowService.findAll(
        { followingId: new Types.ObjectId(uploaderId) } as any,
        'followerId',
        { lean: true } as any,
      );
      const followerIds: string[] = (followDocs as any[])
        .map((d) => (d?.followerId?.toString?.() ?? d?.followerId)?.toString())
        .filter((x) => !!x && x !== uploaderId);

      if (followerIds.length === 0) return;

      const devices = await this.userDeviceService.findAll(
        { uId: { $in: followerIds.map((id) => new Types.ObjectId(id)) }, pushKey: { $ne: null } } as any,
        'pushKey pushProvider',
        { lean: true } as any,
      );

      const fcmTokens = new Set<string>();
      const oneSignalTokens = new Set<string>();
      for (const d of (devices as any[]) || []) {
        const key = (d?.pushKey ?? '').toString();
        if (!key) continue;
        const provider = (d?.pushProvider ?? '').toString();
        if (provider === 'fcm') {
          fcmTokens.add(key);
          continue;
        }
        if (provider === 'onesignal') {
          oneSignalTokens.add(key);
          continue;
        }

        // Backward compatibility: some devices may not have pushProvider set.
        // Infer provider from token format.
        if (isUUID(key)) {
          oneSignalTokens.add(key);
        } else {
          fcmTokens.add(key);
        }
      }

      const mt = (music as any)?.mediaType?.toString?.() ?? 'video';
      const title = mt === 'audio' ? 'New audio upload' : 'New music video';
      const uploaderName = (uploader as any)?.fullName?.toString?.() ?? 'Artist';
      const musicTitle = (music as any)?.title?.toString?.() ?? 'New upload';
      const body = `${uploaderName} uploaded: ${musicTitle}`;

      const data = {
        type: 'music_upload',
        musicId: (music as any)?._id?.toString?.() ?? '',
        uploaderId,
        uploaderName,
        mediaType: mt,
        ts: Date.now().toString(),
      };

      // FCM sendEachForMulticast limit is 500 tokens; chunk to stay safe.
      const fcmList = Array.from(fcmTokens);
      for (const chunk of this._chunk(fcmList, 500)) {
        if (chunk.length === 0) continue;
        this.notificationEmitter.fcmSend(
          new NotificationData({
            tokens: chunk,
            title,
            body,
            tag: uploaderId,
            data,
          }),
        );
      }

      // OneSignal supports bigger batches, but keep a reasonable chunk.
      const osList = Array.from(oneSignalTokens);
      for (const chunk of this._chunk(osList, 2000)) {
        if (chunk.length === 0) continue;
        this.notificationEmitter.oneSignalSend(
          new NotificationData({
            tokens: chunk,
            title,
            body,
            tag: uploaderId,
            data,
          }),
        );
      }
    } catch (e) {
      console.log('[Music][NotifyFollowers] Failed:', e?.message || e);
    }
  }

  async getMusicByIdOrThrow(id: string) {
    const doc = await this.musicModel.findById(id);
    if (!doc) throw new NotFoundException('Music item not found');
    return doc;
  }

  async createMusic(user: IUser, file: Express.Multer.File, body: any): Promise<IMusic> {
    if (!file || !file.buffer) {
      throw new BadRequestException('file is required');
    }

    const mime = file.mimetype || '';
    let mediaType: 'audio' | 'video';
    if (mime.startsWith('video/')) {
      mediaType = 'video';
    } else if (mime.startsWith('audio/')) {
      mediaType = 'audio';
    } else {
      throw new BadRequestException('Only audio and video files are allowed');
    }

    const ext = path.extname(file.originalname || '') || (mediaType === 'audio' ? '.mp3' : '.mp4');
    const fileName = `${uuidv4()}${ext}`;
    const mediaDir = path.join(root.path, 'public', 'media', 'music');
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }
    const mediaPath = path.join(mediaDir, fileName);
    fs.writeFileSync(mediaPath, file.buffer);
    const mediaUrl = `/media/music/${fileName}`;

    // Generate thumbnail for videos
    let thumbnailUrl: string | undefined;
    if (mediaType === 'video') {
      try {
        thumbnailUrl = await VideoThumbnailUtil.generateLocalThumbnail(file.buffer, {
          fileExt: ext,
        });
      } catch (error) {
        console.warn('Warning: Failed to generate video thumbnail:', error);
        const fallback = '';
        if (fallback) {
          thumbnailUrl = fallback;
        }
      }

      if (!thumbnailUrl) {
        const fallback = '';
        if (fallback) {
          thumbnailUrl = fallback;
        }
      }
    }

    const title = (body?.title || file.originalname || '').toString().trim() || 'Untitled';
    const description = (body?.description || '').toString();
    const genreRaw = (body?.genre ?? '').toString().trim();
    const genre = genreRaw ? genreRaw : undefined;
    const durationMs = body?.durationMs != null ? Number(body.durationMs) : undefined;
    let category: 'music' | 'audio' | 'video' | undefined = undefined;
    const c = (body?.category || '').toString().toLowerCase();
    if (c === 'music' && mediaType !== 'audio') {
      // Prevent assigning music category to non-audio
      category = 'video';
    } else if (['music', 'audio', 'video'].includes(c)) {
      category = c as any;
    } else {
      // Default: audio uploads go to 'music' category, videos to 'video'
      category = mediaType === 'audio' ? 'music' : 'video';
    }

    const doc = await this.musicModel.create({
      title,
      description,
      genre,
      mediaUrl,
      mediaType,
      mimeType: mime,
      category,
      durationMs,
      thumbnailUrl,
      uploaderId: (user as any)._id,
      uploaderData: {
        _id: (user as any)._id,
        fullName: (user as any).fullName,
        userImage: (user as any).userImage,
      },
    });

    // Notify followers on new video upload (non-blocking)
    if (mediaType === 'video' || mediaType === 'audio') {
      void this._notifyFollowersOnNewVideo({ music: doc as any, uploader: user });
    }

    return doc;
  }

  async list(params: any) {
    const userId = (params?.userId || '').toString();
    const page = parseInt(params?.page, 10) || 1;
    const limit = Math.min(parseInt(params?.limit, 10) || 20, 100);
    const type = params?.mediaType?.toString();
    const category = params?.category?.toString();
    const uploaderId = params?.uploaderId?.toString();
    const searchRaw = (params?.q ?? params?.query ?? '').toString().trim();

    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const search = searchRaw ? escapeRegex(searchRaw) : '';

    const q: any = {};
    if (type === 'audio' || type === 'video') {
      q.mediaType = type;
    }
    if (category === 'music' || category === 'audio' || category === 'video') {
      q.category = category;
    }
    if (uploaderId && Types.ObjectId.isValid(uploaderId)) {
      q.uploaderId = new Types.ObjectId(uploaderId);
    }

    if (search) {
      q.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'uploaderData.fullName': { $regex: search, $options: 'i' } },
      ];
    }

    const listQuery = this.musicModel
      .find(q)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    if (!userId) {
      listQuery.select('-likedBy');
    }

    const [docs, total] = await Promise.all([listQuery.lean(), this.musicModel.countDocuments(q)]);

    for (const d of docs as any[]) {
      if ((d as any)?.mediaType === 'video' && !(d as any)?.thumbnailUrl) {
        const t = this._buildCloudinaryVideoThumbnailUrl((d as any)?.mediaUrl);
        if (t) {
          (d as any).thumbnailUrl = t;
        }
      }
    }

    if (userId) {
      for (const d of docs as any[]) {
        const likedBy = Array.isArray(d.likedBy) ? d.likedBy : [];
        d.isLiked = likedBy.map((x: any) => x?.toString?.() ?? x).includes(userId);
        delete d.likedBy;
      }
    }

    return {
      docs,
      page,
      limit,
      total,
    };
  }

  async toggleLike(user: IUser, musicId: string) {
    const userId = (user as any)._id.toString();
    const music = await this.musicModel.findById(musicId).lean();
    if (!music) throw new NotFoundException('Music item not found');

    const likedBy = Array.isArray((music as any).likedBy) ? (music as any).likedBy : [];
    const hasLiked = likedBy.map((x: any) => x?.toString?.() ?? x).includes(userId);

    if (hasLiked) {
      await this.musicModel.updateOne(
        { _id: musicId, likedBy: userId, likesCount: { $gt: 0 } },
        { $pull: { likedBy: userId }, $inc: { likesCount: -1 } },
      );
    } else {
      await this.musicModel.updateOne(
        { _id: musicId, likedBy: { $ne: userId } },
        { $addToSet: { likedBy: userId }, $inc: { likesCount: 1 } },
      );
    }

    const updated = await this.musicModel.findById(musicId, 'likesCount').lean();
    return {
      liked: !hasLiked,
      likesCount: (updated as any)?.likesCount ?? 0,
    };
  }

  async listComments(musicId: string, params: any) {
    const page = parseInt(params?.page, 10) || 1;
    const limit = Math.min(parseInt(params?.limit, 10) || 20, 100);
    const flat = params?.flat === 'true' || params?.flat === true;

    // Get top-level comments only
    const query: any = { musicId, parentCommentId: null };
    const [docs, total] = await Promise.all([
      this.commentModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.commentModel.countDocuments({ musicId, parentCommentId: null }),
    ]);

    // If flat mode, return all comments in flat structure
    if (flat) {
      const allDocs = await this.commentModel
        .find({ musicId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      return {
        docs: allDocs,
        page,
        limit,
        total: await this.commentModel.countDocuments({ musicId }),
      };
    }

    // Get replies for these top-level comments
    const parentIds = (docs as any[]).map(d => d._id?.toString?.() ?? d._id).filter(Boolean);
    let replies: any[] = [];
    if (parentIds.length > 0) {
      replies = await this.commentModel
        .find({ musicId, parentCommentId: { $in: parentIds.map(id => new Types.ObjectId(id)) } })
        .sort({ createdAt: 1 })
        .lean();
    }

    // Nest replies under their parent comments
    const docsWithReplies = (docs as any[]).map(d => {
      const commentId = d._id?.toString?.() ?? d._id;
      const commentReplies = replies.filter(r => {
        const parentId = r.parentCommentId?.toString?.() ?? r.parentCommentId;
        return parentId === commentId;
      });
      return {
        ...d,
        replies: commentReplies,
        repliesCount: commentReplies.length,
      };
    });

    return {
      docs: docsWithReplies,
      page,
      limit,
      total,
    };
  }

  async addComment(user: IUser, musicId: string, body: any) {
    const text = (body?.text ?? '').toString().trim();
    const parentCommentId = (body?.parentCommentId ?? '').toString().trim();
    if (!text) throw new BadRequestException('text is required');

    const music = await this.musicModel.findById(musicId);
    if (!music) throw new NotFoundException('Music item not found');

    const userId = (user as any)._id.toString();

    // If replying to a comment, verify the parent comment exists
    if (parentCommentId) {
      const parentComment = await this.commentModel.findById(parentCommentId);
      if (!parentComment) throw new NotFoundException('Parent comment not found');
      if (parentComment.musicId?.toString?.() !== musicId) {
        throw new BadRequestException('Parent comment does not belong to this music item');
      }
    }

    const comment = await this.commentModel.create({
      musicId: music._id,
      userId,
      text,
      parentCommentId: parentCommentId ? new Types.ObjectId(parentCommentId) : null,
      userData: {
        _id: userId,
        fullName: (user as any).fullName,
        userImage: (user as any).userImage,
      },
    });

    await this.musicModel.updateOne({ _id: musicId }, { $inc: { commentsCount: 1 } });
    const updated = await this.musicModel.findById(musicId, 'commentsCount').lean();

    return {
      comment,
      commentsCount: (updated as any)?.commentsCount ?? 0,
    };
  }

  async deleteComment(user: IUser, musicId: string, commentId: string) {
    const userId = (user as any)._id.toString();
    const roles = Array.isArray((user as any).roles) ? (user as any).roles : [];
    const isAdmin = roles.includes(UserRole.Admin) || roles.includes(UserRole.Moderator);

    const comment = await this.commentModel.findById(commentId);
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.musicId?.toString?.() !== musicId) throw new NotFoundException('Comment not found');

    if (!isAdmin && comment.userId?.toString?.() !== userId) {
      throw new ForbiddenException('You can only delete your own comment');
    }

    await this.commentModel.deleteOne({ _id: commentId });
    await this.musicModel.updateOne(
      { _id: musicId, commentsCount: { $gt: 0 } },
      { $inc: { commentsCount: -1 } },
    );
    const updated = await this.musicModel.findById(musicId, 'commentsCount').lean();
    return {
      deleted: true,
      commentsCount: (updated as any)?.commentsCount ?? 0,
    };
  }

  async deleteMusicAsAdmin(musicId: string) {
    const music = await this.musicModel.findById(musicId);
    if (!music) throw new NotFoundException('Music item not found');

    await this._deletePhysicalMedia((music as any).mediaUrl);

    const thumbnailUrl = (music as any).thumbnailUrl;
    if (thumbnailUrl) {
      const mediaPublicId = this._extractCloudinaryPublicId((music as any).mediaUrl);
      const thumbPublicId = this._extractCloudinaryPublicId(thumbnailUrl);
      if (!mediaPublicId || !thumbPublicId || mediaPublicId !== thumbPublicId) {
        await this._deletePhysicalMedia(thumbnailUrl);
      }
    }

    await Promise.all([
      this.commentModel.deleteMany({ musicId: music._id }),
      this.supportModel.deleteMany({ musicId: music._id }),
      this.musicReportService.deleteByMusicId(music._id),
    ]);

    await this.musicModel.findByIdAndDelete(musicId);
    return { deleted: true };
  }

  async deleteMusic(user: IUser, musicId: string) {
    const userId = ((user as any)?._id ?? '').toString();
    if (!userId) {
      throw new ForbiddenException('Invalid user');
    }
    const rolesRaw = (user as any).roles;
    const roles = Array.isArray(rolesRaw) ? rolesRaw.map((r: any) => (r?.toString?.() ?? r).toString()) : [];
    const isAdmin = roles.includes(UserRole.Admin) || roles.includes(UserRole.Moderator);

    const music = await this.musicModel.findById(musicId);
    if (!music) throw new NotFoundException('Music item not found');

    const uploaderField = (music as any).uploaderId;
    const isOwner =
      uploaderField?.equals?.(userId) === true ||
      (uploaderField?.toString?.() ?? uploaderField)?.toString?.() === userId;
    const uploaderDataId = (music as any).uploaderData?._id?.toString?.() ?? (music as any).uploaderData?._id;
    const isOwnerByData = uploaderDataId != null && uploaderDataId.toString() === userId;
    if (!isAdmin && !(isOwner || isOwnerByData)) {
      throw new ForbiddenException('You can only delete your own upload');
    }

    await this._deletePhysicalMedia((music as any).mediaUrl);

    // Delete thumbnail if it exists
    const thumbnailUrl = (music as any).thumbnailUrl;
    if (thumbnailUrl) {
      const mediaPublicId = this._extractCloudinaryPublicId((music as any).mediaUrl);
      const thumbPublicId = this._extractCloudinaryPublicId(thumbnailUrl);
      if (!mediaPublicId || !thumbPublicId || mediaPublicId !== thumbPublicId) {
        await this._deletePhysicalMedia(thumbnailUrl);
      }
    }

    await Promise.all([
      this.commentModel.deleteMany({ musicId: music._id }),
      this.supportModel.deleteMany({ musicId: music._id }),
    ]);

    await this.musicReportService.deleteByMusicId(music._id);

    await this.musicModel.findByIdAndDelete(musicId);
    return { deleted: true };
  }

  private async _deletePhysicalMedia(mediaUrl: string) {
    try {
      await this.fileUploader.deleteByUrl(mediaUrl);
    } catch (_) { }
  }

  async incrementPlays(user: IUser, id: string): Promise<IMusic> {
    const doc = await this.musicModel.findById(id);
    if (!doc) {
      throw new NotFoundException('Music item not found');
    }

    const userId = ((user as any)?._id ?? '').toString();
    const uploaderField = (doc as any).uploaderId;
    const uploaderId = uploaderField?.toString?.() ?? uploaderField;
    const uploaderDataId =
      (doc as any).uploaderData?._id?.toString?.() ?? (doc as any).uploaderData?._id;
    const isOwner =
      !!userId &&
      (((uploaderId?.toString?.() ?? uploaderId)?.toString?.() === userId) ||
        (uploaderDataId != null && uploaderDataId.toString() === userId));

    if (isOwner) {
      return doc;
    }

    const updated = await this.musicModel.findByIdAndUpdate(
      id,
      { $inc: { playsCount: 1 } },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('Music item not found');
    }
    return updated;
  }

  async initiateSupport(user: IUser, musicId: string, body: any) {
    const amount = Math.floor(Number(body?.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be > 0');
    }

    const music = await this.musicModel.findById(musicId);
    if (!music) throw new NotFoundException('Music item not found');

    const senderId = (user as any)._id.toString();
    const receiverId = music.uploaderId?.toString();
    if (!receiverId) throw new BadRequestException('Invalid receiver');
    if (receiverId === senderId) throw new BadRequestException('You cannot support your own music');

    const accountReference = `MUS-${music._id.toString()}`;

    // Create support doc (pending)
    const support = await this.supportModel.create({
      musicId: music._id,
      senderId,
      receiverId,
      currency: 'KES',
      amountKes: amount,
      status: 'pending',
      accountReference,
    });

    try {
      await this.userService.subtractFromBalanceAtomic(senderId, amount);
    } catch (e) {
      await this.supportModel.findByIdAndUpdate(support._id, {
        status: 'failed',
      });
      throw e;
    }

    await this.userService.addToBalance(receiverId, amount);
    await this.supportModel.findByIdAndUpdate(support._id, {
      status: 'success',
      creditedAt: new Date(),
    });

    return {
      supportId: support._id.toString(),
      status: 'success',
      amountKes: amount,
    };
  }

  async getPublicMusic(id: string) {
    const doc = await this.musicModel
      .findById(id)
      .select('title genre mediaUrl mediaType mimeType thumbnailUrl uploaderData createdAt')
      .lean();
    if (!doc) throw new NotFoundException('Music item not found');

    const fallbackThumbnail =
      (doc as any).mediaType === 'video' && !(doc as any).thumbnailUrl
        ? this._buildCloudinaryVideoThumbnailUrl((doc as any).mediaUrl)
        : null;

    const playUrl =
      (doc as any).mediaType === 'video'
        ? this._buildSignedCloudinaryH264Mp4Url((doc as any).mediaUrl)
        : null;

    return {
      _id: (doc as any)._id,
      title: (doc as any).title,
      genre: (doc as any).genre ?? null,
      mediaUrl: (doc as any).mediaUrl,
      playUrl,
      mediaType: (doc as any).mediaType,
      mimeType: (doc as any).mimeType,
      thumbnailUrl: (doc as any).thumbnailUrl ?? fallbackThumbnail ?? null,
      uploaderName: (doc as any).uploaderData?.fullName ?? '',
      uploaderImage: (doc as any).uploaderData?.userImage ?? '',
      createdAt: (doc as any).createdAt,
    };
  }

  private _buildSignedCloudinaryH264Mp4Url(mediaUrl: string): string | null {
    try {
      if (!mediaUrl || typeof mediaUrl !== 'string') return null;
      if (!mediaUrl.startsWith('http')) return null;
      const u = new URL(mediaUrl);
      if (!u.hostname.includes('res.cloudinary.com')) return null;

      const parts = u.pathname.split('/').filter(Boolean);
      const uploadIndex = parts.indexOf('upload');
      if (uploadIndex === -1) return null;

      // After /upload/ we may have version: v123...
      const afterUpload = parts.slice(uploadIndex + 1);
      const withoutVersion =
        afterUpload.length > 0 && /^v\d+$/.test(afterUpload[0])
          ? afterUpload.slice(1)
          : afterUpload;
      if (withoutVersion.length === 0) return null;

      const publicIdWithExt = withoutVersion.join('/');
      const publicId = publicIdWithExt.replace(/\.[^./]+$/, '');

      // Signed transformation: MP4 container + H.264 video + AAC audio
      return cloudinary.url(publicId, {
        resource_type: 'video',
        secure: true,
        sign_url: true,
        transformation: [{ fetch_format: 'mp4', video_codec: 'h264', audio_codec: 'aac' } as any],
      } as any);
    } catch (_) {
      return null;
    }
  }

  private _buildCloudinaryVideoThumbnailUrl(mediaUrl: string): string | null {
    try {
      if (!mediaUrl || typeof mediaUrl !== 'string') return null;
      if (!mediaUrl.startsWith('http')) return null;
      const u = new URL(mediaUrl);
      if (!u.hostname.includes('res.cloudinary.com')) return null;
      const idx = u.pathname.indexOf('/upload/');
      if (idx === -1) return null;

      const prefix = `${u.origin}${u.pathname.substring(0, idx + '/upload/'.length)}`;
      const tail = u.pathname.substring(idx + '/upload/'.length).replace(/^\/+/, '');
      const jpgTail = tail.replace(/\.[^./]+$/, '.jpg');
      const transform = 'so_1,w_640,h_360,c_fill,f_jpg';
      return `${prefix}${transform}/${jpgTail}`;
    } catch (_) {
      return null;
    }
  }

  async getArtists() {
    // Aggregate unique uploaders with their info and content count.
    // IMPORTANT: do not rely on `uploaderData` snapshot (it becomes stale when user updates profile).
    // Instead, lookup the latest data from `users` collection.
    const artists = await this.musicModel.aggregate([
      {
        $group: {
          _id: '$uploaderId',
          legacyFullName: { $first: '$uploaderData.fullName' },
          legacyUserImage: { $first: '$uploaderData.userImage' },
          contentCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          fullName: { $ifNull: ['$user.fullName', '$legacyFullName'] },
          userImage: { $ifNull: ['$user.userImage', '$legacyUserImage'] },
          userImageUpdatedAt: {
            $ifNull: ['$user.updatedAt', null],
          },
        },
      },
      {
        $sort: { contentCount: -1, fullName: 1 },
      },
      {
        $project: {
          _id: 1,
          fullName: 1,
          userImage: 1,
          userImageUpdatedAt: 1,
          contentCount: 1,
        },
      },
    ]);
    return artists;
  }

  private _extractCloudinaryPublicId(url: string): string | null {
    try {
      if (!url || typeof url !== 'string') return null;
      if (!url.includes('res.cloudinary.com')) return null;
      const u = new URL(url);
      const pathname = u.pathname || '';
      const parts = pathname.split('/upload/');
      if (parts.length < 2) return null;
      let tail = parts[1].replace(/^\/+/, '');

      const versionRegex = /\/v\d+\//g;
      let match: RegExpExecArray | null;
      let lastIndex = -1;
      let lastLen = 0;
      while ((match = versionRegex.exec(tail)) !== null) {
        lastIndex = match.index;
        lastLen = match[0].length;
      }
      if (lastIndex >= 0) {
        tail = tail.substring(lastIndex + lastLen);
      }

      tail = tail.replace(/\.[^./]+$/, '');
      return tail || null;
    } catch (_) {
      return null;
    }
  }
}
