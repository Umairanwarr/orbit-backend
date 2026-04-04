import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, SchemaTypes, Types } from "mongoose";

export type CommentDocument = Comment & Document;

@Schema({ timestamps: true })
export class Comment {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Post", required: true })
  postId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "User", required: true })
  userId: Types.ObjectId;

  // Cache the user data again so you don't have to populate the user on every single comment load
  @Prop({ type: Object, required: true })
  userData: {
    _id: Types.ObjectId;
    fullName: string;
    userImage: string;
  };

  @Prop({ type: String, required: true, maxlength: 1000 })
  content: string;

  // Feature 9: The Threading Engine. If this exists, it's a reply.
  @Prop({ type: SchemaTypes.ObjectId, ref: "Comment", default: null })
  parentCommentId?: Types.ObjectId;

  // Helps the frontend know if it should show a "View Replies" button
  @Prop({ type: Number, default: 0 })
  repliesCount: number;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

// Indexes to fetch top-level comments fast, and thread replies fast
CommentSchema.index({ postId: 1, createdAt: -1 });
CommentSchema.index({ parentCommentId: 1, createdAt: 1 });
