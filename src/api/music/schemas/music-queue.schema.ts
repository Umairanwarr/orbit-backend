import { Schema, Document } from "mongoose";

export interface IMusicQueue extends Document {
  userId: any;
  upNext: any[];
}

export const MusicQueueSchema = new Schema<IMusicQueue>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    upNext: [{ type: Schema.Types.ObjectId, ref: "Music", default: [] }],
  },
  {
    timestamps: true,
    collection: "music_queue",
  },
);
