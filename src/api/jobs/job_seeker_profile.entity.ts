import { Document, Schema } from 'mongoose';

export interface IJobSeekerProfile extends Document {
  userId: Schema.Types.ObjectId;
  skills?: string;
  yearsExperience?: number;
  cvUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const JobSeekerProfileSchema = new Schema<IJobSeekerProfile>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  skills: { type: String },
  yearsExperience: { type: Number },
  cvUrl: { type: String },
}, { timestamps: true, collection: 'job_seeker_profiles' });
