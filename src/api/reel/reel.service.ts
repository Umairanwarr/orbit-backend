/// <reference types="multer" />
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, PipelineStage, Types } from "mongoose";
import { promises as fsp } from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { Reel, ReelDocument } from "./entity/reel.schema";
import { ReelComment, ReelCommentDocument } from "./entity/reel-comment.schema";
import { ReelLike, ReelLikeDocument } from "./entity/reel-like.schema";
import {
  compressReelVideo,
  getReelTempDir,
} from "src/core/utils/reel-video-compress.util";

@Injectable()
export class ReelService {
  /** Short TTL cache for trending audio aggregation (reduces repeated heavy pipelines). */
  private trendingAudioCache: {
    at: number;
    limit: number;
    data: unknown[];
  } | null = null;
  /** Same-limit concurrent misses share one aggregation (avoids thundering herd / cache race). */
  private readonly trendingAudioInFlight = new Map<number, Promise<unknown[]>>();
  private readonly TRENDING_AUDIO_TTL_MS = 90_000;

  constructor(
    @InjectModel(Reel.name) private readonly reelModel: Model<ReelDocument>,
    @InjectModel(ReelComment.name)
    private readonly reelCommentModel: Model<ReelCommentDocument>,
    @InjectModel(ReelLike.name)
    private readonly reelLikeModel: Model<ReelLikeDocument>,
  ) {}

  async uploadReel(
    user: any,
    files: { video?: Express.Multer.File[]; cover?: Express.Multer.File[] },
    body: any,
  ) {
    if (!files.video || !files.video[0]) {
      throw new BadRequestException("Reel video file is required");
    }
    if (!files.cover || !files.cover[0]) {
      throw new BadRequestException("Reel cover image is required");
    }

    const videoFile = files.video[0];
    const coverFile = files.cover[0];

    // Validate MIME types
    if (!videoFile.mimetype.startsWith("video/")) {
      throw new BadRequestException("Invalid video file");
    }
    if (!coverFile.mimetype.startsWith("image/")) {
      throw new BadRequestException("Invalid cover image");
    }

    const mediaDir = path.join(process.cwd(), "public", "media", "reels");
    const tempDir = getReelTempDir();
    await fsp.mkdir(mediaDir, { recursive: true });
    await fsp.mkdir(tempDir, { recursive: true });

    const reelId = uuidv4();
    const rawExt = path.extname(videoFile.originalname) || ".mp4";
    const safeExt = rawExt.startsWith(".") ? rawExt : `.${rawExt}`;
    const tempInput = path.join(tempDir, `reel_${reelId}_in${safeExt}`);
    const finalMp4Path = path.join(mediaDir, `reel_${reelId}.mp4`);

    const coverExt = path.extname(coverFile.originalname) || ".jpg";
    const coverName = `cover_${uuidv4()}${coverExt}`;
    const coverPath = path.join(mediaDir, coverName);

    const processVideo = async (): Promise<string> => {
      await fsp.writeFile(tempInput, videoFile.buffer);
      let storedFileName: string;
      try {
        await compressReelVideo(tempInput, finalMp4Path);
        storedFileName = `reel_${reelId}.mp4`;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          "[ReelService] FFmpeg compress failed, storing original file:",
          msg,
        );
        storedFileName = `reel_${reelId}${safeExt}`;
        await fsp.copyFile(tempInput, path.join(mediaDir, storedFileName));
      } finally {
        await fsp.unlink(tempInput).catch(() => undefined);
      }
      return storedFileName;
    };

    const [videoName] = await Promise.all([
      processVideo(),
      fsp.writeFile(coverPath, coverFile.buffer),
    ]);

    // Parse incoming data safely
    const hashtags = body.hashtags
      ? Array.isArray(body.hashtags)
        ? body.hashtags
        : body.hashtags.split(",").map((t) => t.trim())
      : [];

    const newReel = await this.reelModel.create({
      uploaderId: user._id,
      uploaderData: {
        _id: user._id,
        fullName: user.fullName,
        userImage: user.userImage,
      },
      mediaUrl: `/media/reels/${videoName}`,
      coverUrl: `/media/reels/${coverName}`,
      caption: body.caption?.toString().trim() || "",
      hashtags,
      parentReelId: body.parentReelId || null, // Handles Feature 12
      audioId: body.audioId || null,
    });

    return newReel;
  }

  async getTrendingAudio(limit: number = 10) {
    const now = Date.now();
    const c = this.trendingAudioCache;
    if (
      c &&
      c.limit === limit &&
      now - c.at < this.TRENDING_AUDIO_TTL_MS
    ) {
      return c.data;
    }

    let inflight = this.trendingAudioInFlight.get(limit);
    if (!inflight) {
      // Register before any await so concurrent requests get the same Promise (microtask).
      inflight = Promise.resolve()
        .then(() => this.loadTrendingAudioAggregate(limit))
        .then((data) => {
          this.trendingAudioCache = {
            at: Date.now(),
            limit,
            data,
          };
          return data;
        })
        .finally(() => {
          this.trendingAudioInFlight.delete(limit);
        });
      this.trendingAudioInFlight.set(limit, inflight);
    }

    return inflight;
  }

  private async loadTrendingAudioAggregate(limit: number): Promise<unknown[]> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    return this.reelModel.aggregate([
      {
        $match: {
          audioId: { $ne: null },
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: "$audioId",
          usageCount: { $sum: 1 },
        },
      },
      { $sort: { usageCount: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "music",
          localField: "_id",
          foreignField: "_id",
          as: "audioDetails",
        },
      },
      { $unwind: "$audioDetails" },
      {
        $project: {
          _id: 0,
          audioId: "$_id",
          usageCount: 1,
          title: "$audioDetails.title",
          mediaUrl: "$audioDetails.mediaUrl",
          thumbnailUrl: "$audioDetails.thumbnailUrl",
          artist: "$audioDetails.uploaderData.fullName",
        },
      },
    ]);
  }

  async toggleLike(user: any, reelId: string) {
    const existingLike = await this.reelLikeModel.findOne({
      reelId,
      userId: user._id,
    });

    if (existingLike) {
      await existingLike.deleteOne();
      const updatedReel = await this.reelModel.findByIdAndUpdate(
        reelId,
        { $inc: { likesCount: -1 } },
        { new: true, lean: true, select: "likesCount" },
      );
      return {
        liked: false,
        likesCount: Math.max(0, updatedReel?.likesCount || 0),
      };
    } else {
      await this.reelLikeModel.create({ reelId, userId: user._id });
      const updatedReel = await this.reelModel.findByIdAndUpdate(
        reelId,
        { $inc: { likesCount: 1 } },
        { new: true, lean: true, select: "likesCount" },
      );
      return { liked: true, likesCount: updatedReel?.likesCount || 1 };
    }
  }

  async addComment(
    user: any,
    reelId: string,
    content: string,
    parentCommentId?: string,
  ) {
    const newComment = await this.reelCommentModel.create({
      reelId,
      userId: user._id,
      userData: {
        _id: user._id,
        fullName: user.fullName,
        userImage: user.userImage,
      },
      content,
      parentCommentId: parentCommentId || null,
    });

    await this.reelModel.findByIdAndUpdate(reelId, {
      $inc: { commentsCount: 1 },
    });

    if (parentCommentId) {
      await this.reelCommentModel.findByIdAndUpdate(parentCommentId, {
        $inc: { repliesCount: 1 },
      });
    }

    return newComment;
  }

  async incrementShare(reelId: string) {
    if (!reelId?.trim()) {
      throw new BadRequestException("Reel ID is required");
    }
    const updatedReel = await this.reelModel.findByIdAndUpdate(
      reelId.trim(),
      { $inc: { sharesCount: 1 } },
      { new: true, lean: true, select: "sharesCount" },
    );
    if (!updatedReel) {
      throw new NotFoundException("Reel not found");
    }
    return { sharesCount: updatedReel.sharesCount ?? 0 };
  }

  async incrementDownload(reelId: string) {
    if (!reelId?.trim()) {
      throw new BadRequestException("Reel ID is required");
    }
    const updatedReel = await this.reelModel.findByIdAndUpdate(
      reelId.trim(),
      { $inc: { downloadsCount: 1 } },
      { new: true, lean: true, select: "downloadsCount" },
    );
    if (!updatedReel) {
      throw new NotFoundException("Reel not found");
    }
    return { downloadsCount: updatedReel.downloadsCount ?? 0 };
  }

  private encodeFeedCursor(createdAt: Date, id: Types.ObjectId): string {
    return Buffer.from(
      JSON.stringify({ c: createdAt.toISOString(), i: id.toString() }),
      "utf8",
    ).toString("base64url");
  }

  private decodeFeedCursor(raw: string): { createdAt: Date; _id: Types.ObjectId } {
    try {
      const j = JSON.parse(
        Buffer.from(raw, "base64url").toString("utf8"),
      ) as { c: string; i: string };
      const createdAt = new Date(j.c);
      const _id = new Types.ObjectId(j.i);
      if (Number.isNaN(createdAt.getTime())) {
        throw new Error("bad date");
      }
      return { createdAt, _id };
    } catch {
      throw new BadRequestException("Invalid feed cursor");
    }
  }

  /**
   * Newest-first feed with cursor pagination (no $sample — scales on large collections).
   * Pass `cursor` from the previous response's `nextCursor` for the next page.
   */
  async getReelsFeed(
    currentUser: any,
    limit: number = 5,
    cursor?: string,
  ): Promise<{ reels: any[]; nextCursor: string | null }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const filter: Record<string, unknown> = cursor?.trim()
      ? (() => {
          const { createdAt: cAt, _id: cId } = this.decodeFeedCursor(
            cursor.trim(),
          );
          return {
            $and: [
              { uploaderId: { $ne: currentUser._id } },
              { createdAt: { $gte: thirtyDaysAgo } },
              {
                $or: [
                  { createdAt: { $lt: cAt } },
                  { createdAt: cAt, _id: { $lt: cId } },
                ],
              },
            ],
          };
        })()
      : {
          uploaderId: { $ne: currentUser._id },
          createdAt: { $gte: thirtyDaysAgo },
        };

    const likesColl = this.reelLikeModel.collection.name;
    const userId = currentUser._id;

    const pipeline: PipelineStage[] = [
      { $match: filter },
      { $sort: { createdAt: -1, _id: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: likesColl,
          let: { rid: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$reelId", "$$rid"] },
                    { $eq: ["$userId", userId] },
                  ],
                },
              },
            },
            { $limit: 1 },
            { $project: { _id: 1 } },
          ],
          as: "_likeHit",
        },
      },
      {
        $addFields: {
          hasLiked: { $gt: [{ $size: "$_likeHit" }, 0] },
        },
      },
      { $project: { _likeHit: 0 } },
    ];

    const enrichedReels = await this.reelModel.aggregate(pipeline).exec();

    if (enrichedReels.length === 0) {
      return { reels: [], nextCursor: null };
    }

    const lastRaw = enrichedReels[enrichedReels.length - 1] as Record<
      string,
      unknown
    > & {
      _id: Types.ObjectId;
    };
    const lastCreated = lastRaw.createdAt as Date | string | undefined;
    const nextCursor =
      enrichedReels.length === limit
        ? this.encodeFeedCursor(
            lastCreated instanceof Date
              ? lastCreated
              : new Date(String(lastCreated)),
            lastRaw._id,
          )
        : null;

    return { reels: enrichedReels, nextCursor };
  }

  async incrementView(reelId: string) {
    if (!reelId?.trim()) {
      throw new BadRequestException("Reel ID is required");
    }
    const updatedReel = await this.reelModel.findByIdAndUpdate(
      reelId.trim(),
      { $inc: { viewsCount: 1 } },
      { new: true, lean: true, select: "viewsCount" },
    );
    if (!updatedReel) {
      throw new NotFoundException("Reel not found");
    }
    return { viewsCount: updatedReel.viewsCount ?? 0 };
  }
}
