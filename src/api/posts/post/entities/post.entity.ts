import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PostDocument = Post & Document;

export enum PostType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  REEL = 'reel',
  LOCATION = 'location',
}

@Schema({ timestamps: true })
export class Post extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: PostType, default: PostType.TEXT })
  postType: PostType;

  @Prop({ default: '' })
  caption: string;

  @Prop({ default: [] })
  mentionedUsers: Types.ObjectId[];

  @Prop({ default: [] })
  hashtags: string[];

  @Prop({ type: Object, default: null })
  media: {
    url?: string;
    thumbnail?: string;
    mimeType?: string;
    fileSize?: number;
    duration?: number;
    width?: number;
    height?: number;
  };

  // Array of image URLs for multi-photo posts
  @Prop({ type: [String], default: [] })
  mediaUrls: string[];

  @Prop({ type: Object, default: null })
  location: {
    latitude?: number;
    longitude?: number;
    address?: string;
    placeName?: string;
  };

  @Prop({ default: 0 })
  likesCount: number;

  @Prop({ default: 0 })
  commentsCount: number;

  @Prop({ default: 0 })
  sharesCount: number;

  @Prop({ default: false })
  isReel: boolean;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  likedBy: Types.ObjectId[];

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const PostSchema = SchemaFactory.createForClass(Post);
PostSchema.index({ userId: 1, createdAt: -1 });
PostSchema.index({ postType: 1, createdAt: -1 });
PostSchema.index({ hashtags: 1 });
PostSchema.index({ mentionedUsers: 1 });
PostSchema.index({ isReel: 1, createdAt: -1 });
