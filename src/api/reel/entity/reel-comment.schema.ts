import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, SchemaTypes, Types } from "mongoose";

export type ReelCommentDocument = ReelComment & Document;

@Schema({ timestamps: true })
export class ReelComment {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Reel", required: true })
  reelId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "User", required: true })
  userId: Types.ObjectId;

  @Prop({ type: Object, required: true })
  userData: {
    _id: Types.ObjectId;
    fullName: string;
    userImage: string;
  };

  @Prop({ type: String, required: true, maxlength: 500 })
  content: string;

  // Threading support
  @Prop({ type: SchemaTypes.ObjectId, ref: "ReelComment", default: null })
  parentCommentId?: Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  repliesCount: number;
}

export const ReelCommentSchema = SchemaFactory.createForClass(ReelComment);
ReelCommentSchema.index({ reelId: 1, createdAt: -1 });
