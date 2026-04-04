import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { Post, PostDocument } from "./entity/post.schema";
import { Like, LikeDocument } from "./entity/like.schema";
import { VideoThumbnailUtil } from "src/core/utils/video-thumbnail.util";
import { CreatePostDto } from "./dto/create-post.dto";
import { Comment, CommentDocument } from "./entity/comment.schema";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { Save, SaveDocument } from "./entity/save.schema";

@Injectable()
export class PostService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    @InjectModel(Like.name) private readonly likeModel: Model<LikeDocument>,
    @InjectModel(Save.name) private readonly saveModel: Model<SaveDocument>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
  ) {}

  async createSingleMediaPost(
    user: any,
    file: Express.Multer.File,
    body: CreatePostDto,
  ): Promise<PostDocument> {
    if (!file || !file.buffer) {
      throw new BadRequestException("File is required");
    }

    const mime = file.mimetype || "";
    let mediaType: "photo" | "video";

    // 1 & 2: Determine if it is a photo or video
    if (mime.startsWith("image/")) {
      mediaType = "photo";
    } else if (mime.startsWith("video/")) {
      mediaType = "video";
    } else {
      throw new BadRequestException(
        "Only images and videos are allowed for this endpoint",
      );
    }

    const ext =
      path.extname(file.originalname || "") ||
      (mediaType === "photo" ? ".jpg" : ".mp4");
    const fileName = `${uuidv4()}${ext}`;
    const mediaDir = path.join(process.cwd(), "public", "media", "posts");

    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }

    const mediaPath = path.join(mediaDir, fileName);
    fs.writeFileSync(mediaPath, file.buffer);
    const mediaUrl = `/media/posts/${fileName}`;

    // Handle video thumbnails using your existing utility
    let thumbnailUrl: string | undefined;
    if (mediaType === "video") {
      try {
        thumbnailUrl = await VideoThumbnailUtil.generateLocalThumbnail(
          file.buffer,
          {
            fileExt: ext,
          },
        );
      } catch (error) {
        console.warn("Warning: Failed to generate video thumbnail:", error);
        thumbnailUrl = ""; // Fallback
      }
    }

    // Parse incoming body data

    // Save to database
    const newPost = await this.postModel.create({
      uploaderId: user._id,
      uploaderData: {
        _id: user._id,
        fullName: user.fullName,
        userImage: user.userImage,
      },
      mediaType,
      mediaUrls: [mediaUrl],
      thumbnailUrl,
      caption: body.caption,
      location: body.location,
      hashtags: body.hashtags || [],
      taggedUsers: body.taggedUsers || [],
    });

    return newPost;
  }

  async createCarouselPost(
    user: any,
    files: Express.Multer.File[],
    body: CreatePostDto, // <-- Applied DTO here
  ): Promise<PostDocument> {
    if (!files || files.length === 0) {
      throw new BadRequestException(
        "At least one file is required for a carousel",
      );
    }

    if (files.length > 10) {
      throw new BadRequestException(
        "Maximum of 10 images allowed in a carousel",
      );
    }

    const mediaUrls: string[] = [];
    const mediaDir = path.join(process.cwd(), "public", "media", "posts");

    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }

    for (const file of files) {
      const mime = file.mimetype || "";

      if (!mime.startsWith("image/")) {
        throw new BadRequestException(
          "Only images are allowed in image carousels",
        );
      }

      const ext = path.extname(file.originalname || "") || ".jpg";
      const fileName = `${uuidv4()}${ext}`;
      const mediaPath = path.join(mediaDir, fileName);

      fs.writeFileSync(mediaPath, file.buffer);
      mediaUrls.push(`/media/posts/${fileName}`);
    }

    // Save to database directly using the safe DTO data
    const newPost = await this.postModel.create({
      uploaderId: user._id,
      uploaderData: {
        _id: user._id,
        fullName: user.fullName,
        userImage: user.userImage,
      },
      mediaType: "carousel",
      mediaUrls,
      caption: body.caption,
      location: body.location,
      hashtags: body.hashtags || [],
      taggedUsers: body.taggedUsers || [],
    });

    return newPost;
  }

  async toggleLike(user: any, postId: string) {
    // 1. Verify the post actually exists before doing anything
    const post = await this.postModel.findById(postId);
    if (!post) {
      throw new NotFoundException("Post not found");
    }

    // 2. Check if the user has already liked this post
    const existingLike = await this.likeModel.findOne({
      postId,
      userId: user._id,
    });

    if (existingLike) {
      // 3a. If they already liked it, we UNLIKE it (delete the record)
      await existingLike.deleteOne();

      // Atomically decrement the counter so we don't get race conditions
      const updatedPost = await this.postModel.findByIdAndUpdate(
        postId,
        { $inc: { likesCount: -1 } },
        { new: true },
      );

      // Math.max ensures we never accidentally show a negative like count
      return {
        liked: false,
        likesCount: Math.max(0, updatedPost?.likesCount || 0),
      };
    } else {
      // 3b. If they haven't liked it, we LIKE it (create the record)
      await this.likeModel.create({
        postId,
        userId: user._id,
      });

      // Atomically increment the counter
      const updatedPost = await this.postModel.findByIdAndUpdate(
        postId,
        { $inc: { likesCount: 1 } },
        { new: true },
      );

      return {
        liked: true,
        likesCount: updatedPost?.likesCount || 1,
      };
    }
  }

  async addComment(user: any, postId: string, body: CreateCommentDto) {
    const post = await this.postModel.findById(postId);
    if (!post) {
      throw new NotFoundException("Post not found");
    }
    let parentComment = null;
    if (body.parentCommentId) {
      parentComment = await this.commentModel.findById(body.parentCommentId);
      if (!parentComment) {
        throw new NotFoundException("Parent comment not found");
      }
      if (parentComment.postId.toString() !== postId) {
        throw new BadRequestException(
          "Parent comment does not belong to this post",
        );
      }
    }

    // 3. Create the comment
    const newComment = await this.commentModel.create({
      postId,
      userId: user._id,
      userData: {
        _id: user._id,
        fullName: user.fullName,
        userImage: user.userImage,
      },
      content: body.content,
      parentCommentId: body.parentCommentId || null,
    });

    // 4. Update the Post's total comment count
    await this.postModel.findByIdAndUpdate(postId, {
      $inc: { commentsCount: 1 },
    });

    // 5. If it was a reply, update the parent comment's reply count
    if (parentComment) {
      await this.commentModel.findByIdAndUpdate(body.parentCommentId, {
        $inc: { repliesCount: 1 },
      });
    }

    return newComment;
  }

  async toggleSave(user: any, postId: string) {
    const post = await this.postModel.findById(postId);
    if (!post) {
      throw new NotFoundException("Post not found");
    }

    const existingSave = await this.saveModel.findOne({
      postId,
      userId: user._id,
    });

    if (existingSave) {
      // Un-save
      await existingSave.deleteOne();
      const updatedPost = await this.postModel.findByIdAndUpdate(
        postId,
        { $inc: { savesCount: -1 } },
        { new: true },
      );
      return {
        saved: false,
        savesCount: Math.max(0, updatedPost?.savesCount || 0),
      };
    } else {
      // Save
      await this.saveModel.create({
        postId,
        userId: user._id,
      });
      const updatedPost = await this.postModel.findByIdAndUpdate(
        postId,
        { $inc: { savesCount: 1 } },
        { new: true },
      );
      return { saved: true, savesCount: updatedPost?.savesCount || 1 };
    }
  }

  async getFeedPosts(user: any, cursor?: string, limit: number = 10) {
    const query: any = {};

    // If a cursor is provided, fetch posts strictly older than the cursor ID
    if (cursor) {
      query._id = { $lt: cursor };
    }

    // 1. Fetch posts (we fetch limit + 1 to check if there is a "next page")
    // .lean() converts Mongoose documents to plain JSON objects for much faster performance
    const posts = await this.postModel
      .find(query)
      .sort({ _id: -1 }) // Newest first
      .limit(limit + 1)
      .lean();

    // 2. Determine pagination state
    const hasNextPage = posts.length > limit;
    if (hasNextPage) {
      posts.pop(); // Remove the extra post we only fetched to check for a next page
    }
    const nextCursor = hasNextPage
      ? posts[posts.length - 1]._id.toString()
      : null;

    // 3. Post-processing: Check if the CURRENT user liked or saved these posts
    // This is required for the frontend UI to display active/inactive states
    const postIds = posts.map((p) => p._id);

    const [userLikes, userSaves] = await Promise.all([
      this.likeModel
        .find({ userId: user._id, postId: { $in: postIds } })
        .lean(),
      this.saveModel
        .find({ userId: user._id, postId: { $in: postIds } })
        .lean(),
    ]);

    // Convert arrays to Sets for instant lookup (O(1) time complexity)
    const likedPostIds = new Set(userLikes.map((l) => l.postId.toString()));
    const savedPostIds = new Set(userSaves.map((s) => s.postId.toString()));

    // 4. Attach the interaction booleans to the final response
    const enrichedPosts = posts.map((post) => ({
      ...post,
      hasLiked: likedPostIds.has(post._id.toString()),
      hasSaved: savedPostIds.has(post._id.toString()),
    }));

    return {
      posts: enrichedPosts,
      pagination: {
        hasNextPage,
        nextCursor,
      },
    };
  }
}
