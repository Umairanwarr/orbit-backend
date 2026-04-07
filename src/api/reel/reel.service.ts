import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { Reel, ReelDocument } from "./entity/reel.schema";
import { ReelComment, ReelCommentDocument } from "./entity/reel-comment.schema";
import { ReelLike, ReelLikeDocument } from "./entity/reel-like.schema";

@Injectable()
export class ReelService {
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
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }

    // Process Video
    const videoExt = path.extname(videoFile.originalname) || ".mp4";
    const videoName = `reel_${uuidv4()}${videoExt}`;
    fs.writeFileSync(path.join(mediaDir, videoName), videoFile.buffer);

    // Process Cover
    const coverExt = path.extname(coverFile.originalname) || ".jpg";
    const coverName = `cover_${uuidv4()}${coverExt}`;
    fs.writeFileSync(path.join(mediaDir, coverName), coverFile.buffer);

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
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const trendingAudio = await this.reelModel.aggregate([
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
      { $unwind: "$audioDetails" }, // Unpack the array created by $lookup
      {
        // Format the final output cleanly for the frontend
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

    return trendingAudio;
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
        { new: true },
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
        { new: true },
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
    const updatedReel = await this.reelModel.findByIdAndUpdate(
      reelId,
      { $inc: { sharesCount: 1 } },
      { new: true },
    );
    return { sharesCount: updatedReel?.sharesCount || 0 };
  }

  async incrementDownload(reelId: string) {
    const updatedReel = await this.reelModel.findByIdAndUpdate(
      reelId,
      { $inc: { downloadsCount: 1 } },
      { new: true }, // Assuming you added downloadsCount to schema
    );
    return { downloadsCount: updatedReel?.downloadsCount || 0 };
  }

  async getReelsFeed(currentUser: any, limit: number = 5) {
    // Look at reels from the last 30 days to keep the feed highly relevant
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // 1. Fetch a random, algorithmic batch of reels using $sample
    const reels = await this.reelModel.aggregate([
      {
        $match: {
          uploaderId: { $ne: currentUser._id }, // Don't show them their own reels
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      // In a production app, you can add `{ likesCount: { $gte: 5 } }` here
      // to only serve high-quality reels to the global feed.
      { $sample: { size: limit } }, // This makes the feed endless and randomized
      { $sort: { createdAt: -1 } }, // Sort the random batch so the newest plays first
    ]);

    if (reels.length === 0) return [];

    // 2. Check if the current user has liked these specific reels
    const reelIds = reels.map((r) => r._id);
    const userLikes = await this.reelLikeModel
      .find({
        userId: currentUser._id,
        reelId: { $in: reelIds },
      })
      .lean();

    const likedReelIds = new Set(userLikes.map((l) => l.reelId.toString()));

    // 3. Attach the `hasLiked` state
    const enrichedReels = reels.map((reel) => ({
      ...reel,
      hasLiked: likedReelIds.has(reel._id.toString()),
    }));

    return enrichedReels;
  }

  async incrementView(reelId: string) {
    // Every time a user watches a reel for > 3 seconds, the frontend should hit this endpoint.
    const updatedReel = await this.reelModel.findByIdAndUpdate(
      reelId,
      { $inc: { viewsCount: 1 } },
      { new: true },
    );

    return { viewsCount: updatedReel?.viewsCount || 0 };
  }
}
