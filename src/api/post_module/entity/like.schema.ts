import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, SchemaTypes, Types } from "mongoose";

export type LikeDocument = Like & Document;

@Schema({ timestamps: true })
export class Like {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Post", required: true })
  postId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "User", required: true })
  userId: Types.ObjectId;
}

export const LikeSchema = SchemaFactory.createForClass(Like);

// Compound unique index to ensure a user can only like a post once.
// This also makes querying "Did I like this post?" incredibly fast.
LikeSchema.index({ postId: 1, userId: 1 }, { unique: true });
