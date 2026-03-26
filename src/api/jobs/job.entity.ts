import { Document, Schema } from 'mongoose';

export interface IJob extends Document {
  title: string;
  description: string;
  qualifications: string;
  category: string;
  location: string;
  salaryMin?: number;
  salaryMax?: number;
  posterId: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const JobSchema = new Schema<IJob>({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  qualifications: { type: String, required: true },
  category: { type: String, required: true, index: true },
  location: { type: String, required: true, index: true },
  salaryMin: { type: Number },
  salaryMax: { type: Number },
  posterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true, collection: 'jobs' });

JobSchema.index({ title: 'text', description: 'text', qualifications: 'text' });
