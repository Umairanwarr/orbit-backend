import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IArticle } from './article.entity';
import { FileUploaderService } from '../../common/file_uploader/file_uploader.service';
import { CreateS3UploaderDto } from '../../common/file_uploader/create-s3_uploader.dto';
import { IUser } from '../user_modules/user/entities/user.entity';
import { UserRole } from '../../core/utils/enums';
import { PesapalService } from '../payments/pesapal/pesapal.service';
import { ArticleReportService } from './article_report.service';
import { NotificationEmitterService } from '../../common/notification_emitter/notification_emitter.service';
import { NotificationData } from '../../common/notification_emitter/notification.event';
import { UserFollowService } from '../user_modules/user_follow/user_follow.service';
import { UserDeviceService } from '../user_modules/user_device/user_device.service';
import { isUUID } from 'class-validator';

@Injectable()
export class ArticlesService {
  constructor(
    @InjectModel('Article') private readonly articleModel: Model<IArticle>,
    @InjectModel('ArticleSupport') private readonly supportModel: Model<any>,
    @InjectModel('ArticleComment') private readonly commentModel: Model<any>,
    private readonly fileUploader: FileUploaderService,
    private readonly pesapal: PesapalService,
    private readonly articleReportService: ArticleReportService,
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

  private async _notifyFollowersOnNewArticle(params: { article: IArticle; uploader: IUser }) {
    const { article, uploader } = params;
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
        if (isUUID(key)) {
          oneSignalTokens.add(key);
        } else {
          fcmTokens.add(key);
        }
      }

      const title = 'New article';
      const uploaderName = (uploader as any)?.fullName?.toString?.() ?? 'Artist';
      const articleTitle = (article as any)?.title?.toString?.() ?? 'New upload';
      const body = `${uploaderName} uploaded: ${articleTitle}`;

      const data = {
        type: 'article_upload',
        articleId: (article as any)?._id?.toString?.() ?? '',
        uploaderId,
        uploaderName,
        mediaType: 'article',
        ts: Date.now().toString(),
      };

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
      console.log('[Articles][NotifyFollowers] Failed:', e?.message || e);
    }
  }

  async getArticleByIdOrThrow(id: string) {
    const doc = await this.articleModel.findById(id);
    if (!doc) throw new NotFoundException('Article not found');
    return doc;
  }

  async createArticle(user: IUser, file: Express.Multer.File, body: any): Promise<IArticle> {
    if (!file || !file.buffer) {
      throw new BadRequestException('file is required');
    }

    const mime = (file.mimetype || '').toLowerCase();
    if (!mime.startsWith('application/pdf')) {
      throw new BadRequestException('Only PDF files are allowed');
    }

    const uploaderDto = new CreateS3UploaderDto();
    uploaderDto.mediaBuffer = file.buffer;
    uploaderDto.fileName = file.originalname;
    // @ts-ignore - myUser is added dynamically in CommonDto
    uploaderDto.myUser = { _id: (user as any)._id };

    const fileUrl = await this.fileUploader.uploadChatMedia(uploaderDto);

    const title = (body?.title || file.originalname || '').toString().trim() || 'Untitled';
    const description = (body?.description || '').toString();

    const doc = await this.articleModel.create({
      title,
      description,
      fileUrl,
      mimeType: mime,
      uploaderId: (user as any)._id,
      uploaderData: {
        _id: (user as any)._id,
        fullName: (user as any).fullName,
        userImage: (user as any).userImage,
      },
    });

    // Notify followers on new article upload (non-blocking)
    void this._notifyFollowersOnNewArticle({ article: doc as any, uploader: user });

    return doc;
  }

  async list(params: any) {
    const userId = (params?.userId || '').toString();
    const page = parseInt(params?.page, 10) || 1;
    const limit = Math.min(parseInt(params?.limit, 10) || 20, 100);
    const searchRaw = (params?.q ?? params?.query ?? '').toString().trim();

    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const search = searchRaw ? escapeRegex(searchRaw) : '';

    const q: any = {};
    if (search) {
      q.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'uploaderData.fullName': { $regex: search, $options: 'i' } },
      ];
    }

    const listQuery = this.articleModel
      .find(q)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    if (!userId) {
      listQuery.select('-likedBy');
    }

    const [docs, total] = await Promise.all([listQuery.lean(), this.articleModel.countDocuments(q)]);

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

  async toggleLike(user: IUser, articleId: string) {
    const userId = (user as any)._id.toString();
    const art = await this.articleModel.findById(articleId).lean();
    if (!art) throw new NotFoundException('Article not found');

    const likedBy = Array.isArray((art as any).likedBy) ? (art as any).likedBy : [];
    const hasLiked = likedBy.map((x: any) => x?.toString?.() ?? x).includes(userId);

    if (hasLiked) {
      await this.articleModel.updateOne(
        { _id: articleId, likedBy: userId, likesCount: { $gt: 0 } },
        { $pull: { likedBy: userId }, $inc: { likesCount: -1 } },
      );
    } else {
      await this.articleModel.updateOne(
        { _id: articleId, likedBy: { $ne: userId } },
        { $addToSet: { likedBy: userId }, $inc: { likesCount: 1 } },
      );
    }

    const updated = await this.articleModel.findById(articleId, 'likesCount').lean();
    return {
      liked: !hasLiked,
      likesCount: (updated as any)?.likesCount ?? 0,
    };
  }

  async listComments(articleId: string, params: any) {
    const page = parseInt(params?.page, 10) || 1;
    const limit = Math.min(parseInt(params?.limit, 10) || 20, 100);
    const flat = params?.flat === 'true' || params?.flat === true;

    // Get top-level comments only
    const query: any = { articleId, parentCommentId: null };
    const [docs, total] = await Promise.all([
      this.commentModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.commentModel.countDocuments({ articleId, parentCommentId: null }),
    ]);

    // If flat mode, return all comments in flat structure
    if (flat) {
      const allDocs = await this.commentModel
        .find({ articleId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      return {
        docs: allDocs,
        page,
        limit,
        total: await this.commentModel.countDocuments({ articleId }),
      };
    }

    // Get replies for these top-level comments
    const parentIds = (docs as any[]).map(d => d._id?.toString?.() ?? d._id).filter(Boolean);
    let replies: any[] = [];
    if (parentIds.length > 0) {
      replies = await this.commentModel
        .find({ articleId, parentCommentId: { $in: parentIds.map(id => new Types.ObjectId(id)) } })
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

  async addComment(user: IUser, articleId: string, body: any) {
    const text = (body?.text ?? '').toString().trim();
    const parentCommentId = (body?.parentCommentId ?? '').toString().trim();
    if (!text) throw new BadRequestException('text is required');

    const art = await this.articleModel.findById(articleId);
    if (!art) throw new NotFoundException('Article not found');

    const userId = (user as any)._id.toString();

    // If replying to a comment, verify the parent comment exists
    if (parentCommentId) {
      const parentComment = await this.commentModel.findById(parentCommentId);
      if (!parentComment) throw new NotFoundException('Parent comment not found');
      if (parentComment.articleId?.toString?.() !== articleId) {
        throw new BadRequestException('Parent comment does not belong to this article');
      }
    }

    const comment = await this.commentModel.create({
      articleId: art._id,
      userId,
      text,
      parentCommentId: parentCommentId ? new Types.ObjectId(parentCommentId) : null,
      userData: {
        _id: userId,
        fullName: (user as any).fullName,
        userImage: (user as any).userImage,
      },
    });

    await this.articleModel.updateOne({ _id: articleId }, { $inc: { commentsCount: 1 } });
    const updated = await this.articleModel.findById(articleId, 'commentsCount').lean();

    return {
      comment,
      commentsCount: (updated as any)?.commentsCount ?? 0,
    };
  }

  async deleteComment(user: IUser, articleId: string, commentId: string) {
    const userId = (user as any)._id.toString();
    const roles = Array.isArray((user as any).roles) ? (user as any).roles : [];
    const isAdmin = roles.includes(UserRole.Admin) || roles.includes(UserRole.Moderator);

    const comment = await this.commentModel.findById(commentId);
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.articleId?.toString?.() !== articleId) throw new NotFoundException('Comment not found');

    if (!isAdmin && comment.userId?.toString?.() !== userId) {
      throw new ForbiddenException('You can only delete your own comment');
    }

    await this.commentModel.deleteOne({ _id: commentId });
    await this.articleModel.updateOne(
      { _id: articleId, commentsCount: { $gt: 0 } },
      { $inc: { commentsCount: -1 } },
    );
    const updated = await this.articleModel.findById(articleId, 'commentsCount').lean();
    return {
      deleted: true,
      commentsCount: (updated as any)?.commentsCount ?? 0,
    };
  }

  async initiateSupport(user: IUser, articleId: string, body: any) {
    const amount = Math.floor(Number(body?.amount || 0));
    const phone = (body?.phone || '').toString().trim();
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be > 0');
    }
    if (!phone) throw new BadRequestException('phone is required');

    const art = await this.articleModel.findById(articleId);
    if (!art) throw new NotFoundException('Article not found');

    const senderId = (user as any)._id.toString();
    const receiverId = art.uploaderId?.toString();
    if (!receiverId) throw new BadRequestException('Invalid receiver');

    const accountReference = `ART-${art._id.toString()}`;

    const support = await this.supportModel.create({
      articleId: art._id,
      senderId,
      receiverId,
      currency: 'KES',
      amountKes: amount,
      status: 'pending',
      accountReference,
    });

    const res = await this.pesapal.submitOrder({
      userId: senderId,
      amount,
      currency: 'KES',
      description: 'Article Support',
      accountReference,
    });

    if (res?.orderTrackingId || res?.merchantReference) {
      await this.supportModel.findByIdAndUpdate(support._id, {
        orderTrackingId: res.orderTrackingId,
        merchantReference: res.merchantReference,
      });
    }

    return { ...res, supportId: support._id.toString() };
  }

  async deleteArticle(user: IUser, articleId: string) {
    const userId = ((user as any)?._id ?? '').toString();
    if (!userId) throw new ForbiddenException('Invalid user');

    const rolesRaw = (user as any).roles;
    const roles = Array.isArray(rolesRaw) ? rolesRaw.map((r: any) => (r?.toString?.() ?? r).toString()) : [];
    const isAdmin = roles.includes(UserRole.Admin) || roles.includes(UserRole.Moderator);

    const article = await this.articleModel.findById(articleId);
    if (!article) throw new NotFoundException('Article not found');

    const uploaderField = (article as any).uploaderId;
    const isOwner =
      uploaderField?.equals?.(userId) === true ||
      (uploaderField?.toString?.() ?? uploaderField)?.toString?.() === userId;
    const uploaderDataId = (article as any).uploaderData?._id?.toString?.() ?? (article as any).uploaderData?._id;
    const isOwnerByData = uploaderDataId != null && uploaderDataId.toString() === userId;

    if (!isAdmin && !(isOwner || isOwnerByData)) {
      throw new ForbiddenException('You can only delete your own upload');
    }

    await this._deletePhysicalMedia((article as any).fileUrl);
    await Promise.all([
      this.commentModel.deleteMany({ articleId: article._id }),
      this.supportModel.deleteMany({ articleId: article._id }),
      this.articleReportService.deleteByArticleId(article._id),
    ]);
    await this.articleModel.findByIdAndDelete(articleId);
    return { deleted: true };
  }

  async deleteArticleAsAdmin(articleId: string) {
    const article = await this.articleModel.findById(articleId);
    if (!article) throw new NotFoundException('Article not found');

    await this._deletePhysicalMedia((article as any).fileUrl);
    await Promise.all([
      this.commentModel.deleteMany({ articleId: article._id }),
      this.supportModel.deleteMany({ articleId: article._id }),
      this.articleReportService.deleteByArticleId(article._id),
    ]);
    await this.articleModel.findByIdAndDelete(articleId);
    return { deleted: true };
  }

  private async _deletePhysicalMedia(mediaUrl: string) {
    try {
      await this.fileUploader.deleteByUrl(mediaUrl);
    } catch (_) { }
  }
}
