import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, SchemaTypes, Types } from "mongoose";

export type ReelLikeDocument = ReelLike & Document;

@Schema({ timestamps: true })
export class ReelLike {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Reel", required: true })
  reelId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "User", required: true })
  userId: Types.ObjectId;
}

export const ReelLikeSchema = SchemaFactory.createForClass(ReelLike);
ReelLikeSchema.index({ reelId: 1, userId: 1 }, { unique: true });
