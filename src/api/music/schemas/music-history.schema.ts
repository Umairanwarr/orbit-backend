import { Schema, Document } from "mongoose";

export interface IMusicHistory extends Document {
  userId: any;
  musicId: any;
  playedAt: Date;
}

export const MusicHistorySchema = new Schema<IMusicHistory>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    musicId: { type: Schema.Types.ObjectId, ref: "Music", required: true },
    playedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: "music_history",
  },
);

MusicHistorySchema.index({ userId: 1, playedAt: -1 });
