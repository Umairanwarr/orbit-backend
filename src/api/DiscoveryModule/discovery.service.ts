import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Post, PostDocument } from "../post_module/entity/post.schema";

@Injectable()
export class DiscoveryService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    // Injecting your User model. Ensure the name matches what you registered in MongooseModule
    @InjectModel("User") private readonly userModel: Model<any>,
  ) {}

  // --- Features 1 & 3: Discover Page & Featured Creators ---
  async getFeaturedCreators(limit: number = 10) {
    const creators = await this.userModel
      .find({
        deletedAt: null, // Ignore deleted accounts
        $or: [
          { banTo: null },
          { banTo: { $lt: new Date() } }, // Ignore currently banned accounts
        ],
        "userPrivacy.publicSearch": true, // Respect privacy settings
      })
      .sort({ loyaltyPoints: -1 })
      .limit(limit)
      .select(
        "_id fullName fullNameEn userImage bio profession verifiedAt loyaltyPoints",
      )
      .lean();

    return creators;
  }

  // --- Feature 4: Suggested Friends ---
  async getSuggestedFriends(currentUser: any, limit: number = 10) {
    const suggestions = await this.userModel.aggregate([
      {
        $match: {
          _id: { $ne: new Types.ObjectId(currentUser._id) },
          deletedAt: null,
          $or: [{ banTo: null }, { banTo: { $lt: new Date() } }],
          "userPrivacy.publicSearch": true, // Crucial: don't suggest people who hid their profiles
        },
      },
      { $sample: { size: limit } }, // Random assortment
      {
        $project: {
          _id: 1,
          fullName: 1,
          userImage: 1,
          bio: 1,
          profession: 1,
          loyaltyPoints: 1,
        },
      },
    ]);

    return suggestions;
  }

  // --- Feature 5: Public Snap Feed ---
  // (This remains exactly the same as the previous step, querying the Post model)
  async getPublicSnapFeed(cursor?: string, limit: number = 15) {
    const query: any = {};
    if (cursor) {
      query._id = { $lt: cursor };
    }

    const posts = await this.postModel
      .find(query)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasNextPage = posts.length > limit;
    if (hasNextPage) {
      posts.pop();
    }
    const nextCursor = hasNextPage
      ? posts[posts.length - 1]._id.toString()
      : null;

    return {
      posts,
      pagination: { hasNextPage, nextCursor },
    };
  }

  async getExploreFeed(currentUser: any, limit: number = 15) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const explorePosts = await this.postModel.aggregate([
      {
        $match: {
          uploaderId: { $ne: new Types.ObjectId(currentUser._id) }, // Don't show their own posts
          createdAt: { $gte: sevenDaysAgo }, // Only recent content
          likesCount: { $gte: 5 }, // Must have a baseline of engagement to be "recommended"
        },
      },
      { $sample: { size: limit } }, // Randomize the output for a fresh feed
      { $sort: { likesCount: -1 } }, // Sort the random batch by most liked
    ]);

    return explorePosts;
  }

  // --- Feature 2: Trending Reels Section ---
  // Algorithm: Finds only 'video' media types from the last 7 days, strictly sorted by likes & comments.
  async getTrendingReels(limit: number = 10) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const trendingReels = await this.postModel
      .find({
        mediaType: "video",
        createdAt: { $gte: sevenDaysAgo },
      })
      .sort({ likesCount: -1, commentsCount: -1 }) // Primary sort: Likes. Secondary sort: Comments.
      .limit(limit)
      .lean();

    return trendingReels;
  }

  // --- Feature 3: Trending Hashtags ---
  // Algorithm: Unwinds the hashtags array and counts occurrences across all posts in the last week.
  async getTrendingHashtags(limit: number = 10) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const hashtags = await this.postModel.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo }, hashtags: { $ne: [] } } },
      { $unwind: "$hashtags" }, // Splits arrays into individual documents
      {
        $group: {
          _id: { $toLower: "$hashtags" }, // Group by lowercase tag name
          count: { $sum: 1 }, // Count them
        },
      },
      { $sort: { count: -1 } }, // Most used first
      { $limit: limit },
      {
        $project: {
          _id: 0,
          hashtag: "$_id",
          postCount: "$count",
        },
      },
    ]);

    return hashtags;
  }

  // --- Feature 5: Category-Based Discovery ---
  // Standard cursor pagination filtered by category
  async getCategoryPosts(
    category: string,
    cursor?: string,
    limit: number = 15,
  ) {
    const query: any = { category };

    if (cursor) {
      query._id = { $lt: cursor };
    }

    const posts = await this.postModel
      .find(query)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasNextPage = posts.length > limit;
    if (hasNextPage) {
      posts.pop();
    }
    const nextCursor = hasNextPage
      ? posts[posts.length - 1]._id.toString()
      : null;

    return {
      posts,
      pagination: {
        hasNextPage,
        nextCursor,
      },
    };
  }
}
