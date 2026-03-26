import mongoose, { Schema } from "mongoose";
import pM from "mongoose-paginate-v2";

export interface IUserFollow {
  _id: string;
  followerId: string;
  followingId: string;
  createdAt: Date;
  updatedAt: Date;
}

export const UserFollowSchema = new mongoose.Schema(
  {
    followerId: { type: Schema.Types.ObjectId, required: true, ref: "user" },
    followingId: { type: Schema.Types.ObjectId, required: true, ref: "user" },
  },
  {
    timestamps: true,
  }
);

UserFollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
UserFollowSchema.index({ followerId: 1, createdAt: -1 });
UserFollowSchema.index({ followingId: 1, createdAt: -1 });

UserFollowSchema.plugin(pM);
