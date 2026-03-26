import mongoose, { Schema } from 'mongoose';
import pM from 'mongoose-paginate-v2';

export type MusicReportStatus = 'pending' | 'ignored' | 'removed';

export interface IMusicReport {
  uId: string;
  musicId: string;
  content: string;
  status: MusicReportStatus;
  actionBy?: string;
  actionAt?: Date;
}

export const MusicReportSchema = new mongoose.Schema(
  {
    uId: { type: String, required: true, ref: 'user', index: true },
    musicId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Music',
      index: true,
    },
    content: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'ignored', 'removed'],
      default: 'pending',
      index: true,
    },
    actionBy: { type: String, default: null, ref: 'user' },
    actionAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

MusicReportSchema.index({ uId: 1, musicId: 1 }, { unique: true });
MusicReportSchema.plugin(pM);
