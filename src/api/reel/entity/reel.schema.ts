import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, SchemaTypes, Types } from "mongoose";

export type ReelDocument = Reel & Document;

@Schema({ timestamps: true })
export class Reel {
  @Prop({ type: SchemaTypes.ObjectId, ref: "User", required: true })
  uploaderId: Types.ObjectId;

  @Prop({ type: Object, required: true })
  uploaderData: {
    _id: Types.ObjectId;
    fullName: string;
    userImage: string;
  };

  // Feature 1: The uploaded video URL
  @Prop({ type: String, required: true })
  mediaUrl: string;

  // Feature 7: Custom cover image (thumbnail)
  @Prop({ type: String, required: true })
  coverUrl: string;

  @Prop({ type: String, maxlength: 500 })
  caption?: string;

  @Prop({ type: [String], default: [] })
  hashtags: string[];

  // Feature 12: Remix System. If this reel is a remix, it points to the original reel.
  @Prop({ type: SchemaTypes.ObjectId, ref: "Reel", default: null })
  parentReelId?: Types.ObjectId;

  // Preparing for Phase 2: Audio Engine
  @Prop({ type: SchemaTypes.ObjectId, ref: "Music", default: null })
  audioId?: Types.ObjectId;

  // Engagement Counters
  @Prop({ type: Number, default: 0 })
  likesCount: number;

  @Prop({ type: Number, default: 0 })
  commentsCount: number;

  @Prop({ type: Number, default: 0 })
  sharesCount: number;

  @Prop({ type: Number, default: 0 })
  viewsCount: number;

  @Prop({ type: Number, default: 0 })
  downloadsCount: number;
}

export const ReelSchema = SchemaFactory.createForClass(Reel);

ReelSchema.index({ createdAt: -1 });
ReelSchema.index({ audioId: 1 }); // Important for trending audio later
