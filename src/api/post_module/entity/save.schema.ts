import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, SchemaTypes, Types } from "mongoose";

export type SaveDocument = Save & Document;

@Schema({ timestamps: true })
export class Save {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Post", required: true })
  postId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "User", required: true })
  userId: Types.ObjectId;
}

export const SaveSchema = SchemaFactory.createForClass(Save);

SaveSchema.index({ postId: 1, userId: 1 }, { unique: true });
