import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Post, PostDocument, PostType } from './entities/post.entity';
import { PostComment, PostCommentSchema } from './entities/post_comment.entity';
import { CreatePostDto, UpdatePostDto, QueryPostDto } from './dto/post.dto';
import { UserFollowService } from 'src/api/user_modules/user_follow/user_follow.service';

@Injectable()
export class PostService {
  private get commentModel(): Model<PostComment> {
    if (this.connection.models['PostComment']) {
      return this.connection.models['PostComment'] as Model<PostComment>;
    }
    return this.connection.model<PostComment>('PostComment', PostCommentSchema);
  }

  private get storyModel(): Model<any> {
    if (this.connection.models['story']) {
      return this.connection.models['story'] as Model<any>;
    }
    return this.connection.model('story');
  }

  private get storyAttachmentModel(): Model<any> {
    if (this.connection.models['story_attachment']) {
      return this.connection.models['story_attachment'] as Model<any>;
    }
    return this.connection.model('story_attachment');
  }

  private get messageModel(): Model<any> {
    if (this.connection.models['message']) {
      return this.connection.models['message'] as Model<any>;
    }
    return this.connection.model('message');
  }

  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectConnection() private connection: Connection,
    private readonly userFollowService: UserFollowService,
  ) {}

  private parseMentions(caption: string): Types.ObjectId[] {
    const mentions = caption?.match(/@(\w+)/g) || [];
    return mentions.map(m => m.substring(1)).filter(Boolean).map(id => {
      try {
        return new Types.ObjectId(id);
      } catch {
        return null;
      }
    }).filter(Boolean) as Types.ObjectId[];
  }

  private parseHashtags(caption: string): string[] {
    const hashtags = caption?.match(/#(\w+)/g) || [];
    return hashtags.map(h => h.substring(1).toLowerCase()).filter(Boolean);
  }

  async create(dto: CreatePostDto, userId: string): Promise<Post> {
    const mentionedUsers = this.parseMentions(dto.caption || '');
    const hashtags = this.parseHashtags(dto.caption || '');

    const post = new this.postModel({
      userId: new Types.ObjectId(userId),
      postType: dto.postType,
      caption: dto.caption || '',
      mentionedUsers,
      hashtags,
      media: dto.media || null,
      mediaUrls: dto.mediaUrls || [],
      location: dto.location || null,
      isReel: dto.postType === PostType.REEL || dto.isReel || false,
    });

    return post.save();
  }

  async findAll(query: QueryPostDto, page: number = 1, limit: number = 20, currentUserId?: string) {
    const filter: any = { isActive: true };

    if (query.postType) {
      filter.postType = query.postType;
    }
    if (query.hashtag) {
      filter.hashtags = query.hashtag.toLowerCase();
    }
    if (query.userId) {
      filter.userId = new Types.ObjectId(query.userId);
    }

    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      this.postModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'fullName userImage username')
        .lean(),
      this.postModel.countDocuments(filter),
    ]);

    // Attach isFollowing to each post's userId if current user is provided
    if (currentUserId && posts.length > 0) {
      const uniqueAuthorIds = [...new Set(
        posts
          .map(p => (p.userId as any)?._id?.toString())
          .filter(id => id && id !== currentUserId)
      )];
      const followChecks = await Promise.all(
        uniqueAuthorIds.map(id =>
          this.userFollowService.isFollowing(currentUserId, id).then(isFollowing => ({ id, isFollowing }))
        )
      );
      const followMap = new Map(followChecks.map(f => [f.id, f.isFollowing]));
      for (const post of posts) {
        const authorId = (post.userId as any)?._id?.toString();
        if (authorId && authorId !== currentUserId) {
          (post.userId as any).isFollowing = followMap.get(authorId) ?? false;
        } else if (authorId === currentUserId) {
          (post.userId as any).isFollowing = true; // own posts
        }
      }
    }

    return {
      docs: posts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findReels(page: number = 1, limit: number = 20, currentUserId?: string) {
    return this.findAll({ postType: PostType.REEL } as QueryPostDto, page, limit, currentUserId);
  }

  async findById(id: string): Promise<Post | null> {
    return this.postModel
      .findOne({ _id: new Types.ObjectId(id), isActive: true })
      .populate('userId', 'fullName userImage username')
      .lean();
  }

  async update(id: string, dto: UpdatePostDto, userId: string): Promise<Post | null> {
    const mentionedUsers = dto.caption ? this.parseMentions(dto.caption) : undefined;
    const hashtags = dto.caption ? this.parseHashtags(dto.caption) : undefined;

    const updateData: any = { ...dto };
    if (mentionedUsers !== undefined) updateData.mentionedUsers = mentionedUsers;
    if (hashtags !== undefined) updateData.hashtags = hashtags;

    return this.postModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) },
        { $set: updateData },
        { new: true },
      )
      .populate('userId', 'fullName userImage username')
      .lean();
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.postModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) },
      { $set: { isActive: false } },
    );
    if (!result) return false;

    // Remove all stories that were shared from this post (post_share stories)
    const relatedStories = await this.storyModel
      .find({ 'att.postId': id }, { _id: 1 })
      .lean();
    const relatedStoryIds = relatedStories
      .map((s: any) => s?._id)
      .filter(Boolean);

    if (relatedStoryIds.length > 0) {
      await this.storyAttachmentModel.deleteMany({ storyId: { $in: relatedStoryIds } });
      await this.storyModel.deleteMany({ _id: { $in: relatedStoryIds } });
    }

    // Hide chat post-share messages that reference this post
    await this.messageModel.updateMany(
      {
        $or: [
          { 'msgAtt.type': 'post_share', 'msgAtt.postId': id },
          { 'msgAtt.data.type': 'post_share', 'msgAtt.data.postId': id },
        ],
      },
      {
        $set: {
          dltAt: new Date(),
        },
      },
    );

    return true;
  }

  async likePost(postId: string, userId: string): Promise<Post | null> {
    const post = await this.postModel.findOne({
      _id: new Types.ObjectId(postId),
      isActive: true,
    });
    if (!post) return null;

    const userIdObj = new Types.ObjectId(userId);
    const alreadyLiked = post.likedBy?.some(id => id.toString() === userId);

    if (alreadyLiked) {
      post.likedBy = post.likedBy?.filter(id => id.toString() !== userId);
      post.likesCount = Math.max(0, (post.likesCount || 0) - 1);
    } else {
      post.likedBy = [...(post.likedBy || []), userIdObj];
      post.likesCount = (post.likesCount || 0) + 1;
    }

    return post.save();
  }

  async getMyPosts(userId: string, page: number = 1, limit: number = 20) {
    return this.findAll({ userId } as QueryPostDto, page, limit);
  }

  async incrementComments(postId: string): Promise<void> {
    await this.postModel.findByIdAndUpdate(postId, {
      $inc: { commentsCount: 1 },
    });
  }

  async incrementShares(postId: string): Promise<void> {
    await this.postModel.findByIdAndUpdate(postId, {
      $inc: { sharesCount: 1 },
    });
  }

  async sharePost(postId: string): Promise<{ sharesCount: number }> {
    const post = await this.postModel.findOneAndUpdate(
      { _id: new Types.ObjectId(postId), isActive: true },
      { $inc: { sharesCount: 1 } },
      { new: true, select: 'sharesCount' },
    ).lean();
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    return { sharesCount: (post as any)?.sharesCount ?? 0 };
  }

  async listComments(
    postId: string,
    params: { page?: number; limit?: number },
  ): Promise<{ docs: any[]; total: number; page: number; limit: number }> {
    const page = Number(params?.page) || 1;
    const limit = Math.min(Number(params?.limit) || 50, 200);
    const postObjId = new Types.ObjectId(postId);

    // Fetch only top-level comments (parentCommentId is null)
    const topLevelQuery = { postId: postObjId, parentCommentId: null };
    const [topLevel, total] = await Promise.all([
      this.commentModel
        .find(topLevelQuery)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.commentModel.countDocuments(topLevelQuery),
    ]);

    if (topLevel.length === 0) {
      return { docs: [], total, page, limit };
    }

    // Fetch all replies for these top-level comments in one query
    const parentIds = topLevel.map((c: any) => c._id);
    const replies = await this.commentModel
      .find({ postId: postObjId, parentCommentId: { $in: parentIds } })
      .sort({ createdAt: 1 })
      .lean();

    // Group replies under their parent
    const replyMap = new Map<string, any[]>();
    for (const reply of replies) {
      const key = (reply as any).parentCommentId?.toString();
      if (!key) continue;
      if (!replyMap.has(key)) replyMap.set(key, []);
      replyMap.get(key)!.push(reply);
    }

    const docs = topLevel.map((c: any) => ({
      ...c,
      replies: replyMap.get(c._id.toString()) ?? [],
      repliesCount: replyMap.get(c._id.toString())?.length ?? 0,
    }));

    return { docs, total, page, limit };
  }

  async addComment(
    postId: string,
    user: any,
    body: { text: string; parentCommentId?: string },
  ): Promise<{ comment: PostComment; commentsCount: number }> {
    const comment = await this.commentModel.create({
      postId: new Types.ObjectId(postId),
      userId: user._id?.toString() ?? user.id?.toString(),
      text: body.text?.toString().trim(),
      parentCommentId:
        body.parentCommentId && Types.ObjectId.isValid(body.parentCommentId)
          ? new Types.ObjectId(body.parentCommentId)
          : null,
      userData: {
        _id: user._id?.toString() ?? user.id?.toString(),
        fullName: user.fullName ?? '',
        userImage: user.userImage ?? '',
      },
    });
    const post = await this.postModel.findByIdAndUpdate(
      postId,
      { $inc: { commentsCount: 1 } },
      { new: true, select: 'commentsCount' },
    ).lean();
    return { comment: comment.toObject() as any, commentsCount: (post as any)?.commentsCount ?? 0 };
  }

  async deleteComment(
    postId: string,
    commentId: string,
    userId: string,
  ): Promise<{ commentsCount: number }> {
    await this.commentModel.deleteOne({
      _id: new Types.ObjectId(commentId),
      postId: new Types.ObjectId(postId),
      userId,
    });
    const post = await this.postModel.findByIdAndUpdate(
      postId,
      { $inc: { commentsCount: -1 } },
      { new: true, select: 'commentsCount' },
    ).lean();
    return { commentsCount: Math.max((post as any)?.commentsCount ?? 0, 0) };
  }
}
