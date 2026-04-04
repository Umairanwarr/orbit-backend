import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, SchemaTypes, Types } from "mongoose";

export type PostDocument = Post & Document;

@Schema({ timestamps: true })
export class Post {
  @Prop({ type: SchemaTypes.ObjectId, ref: "User", required: true })
  uploaderId: Types.ObjectId;

  // Caching basic user data so you don't have to populate on every feed fetch
  @Prop({ type: Object })
  uploaderData: {
    _id: Types.ObjectId;
    fullName: string;
    userImage: string;
  };

  // Supports features 1, 2, and 3
  @Prop({ type: String, enum: ["photo", "video", "carousel"], required: true })
  mediaType: string;

  // Array to hold one or multiple URLs for the carousel
  @Prop({ type: [String], required: true })
  mediaUrls: string[];

  // Essential for video posts
  @Prop({ type: String })
  thumbnailUrl?: string;

  // Feature 4: Caption
  @Prop({ type: String })
  caption?: string;

  // Extracted from caption or passed separately from frontend
  @Prop({ type: [String], default: [] })
  hashtags: string[];

  // Feature 5: Location tagging
  @Prop({ type: String })
  location?: string;

  // Feature 6: Tag other users
  @Prop({ type: [{ type: SchemaTypes.ObjectId, ref: "User" }], default: [] })
  taggedUsers: Types.ObjectId[];

  // Counters for Features 7 & 8 (keeps feed queries lightweight)
  @Prop({ type: Number, default: 0 })
  likesCount: number;

  @Prop({ type: Number, default: 0 })
  commentsCount: number;

  @Prop({ type: Number, default: 0 })
  savesCount: number;

  @Prop({ type: String, index: true })
  category?: string;
}

export const PostSchema = SchemaFactory.createForClass(Post);

// Indexes for fast feed sorting, user profile fetching, and hashtag discovery
PostSchema.index({ createdAt: -1 });
PostSchema.index({ uploaderId: 1, createdAt: -1 });
PostSchema.index({ hashtags: 1 });
