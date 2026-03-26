import mongoose, { Schema } from "mongoose";
import pM from "mongoose-paginate-v2";

export interface IEmergencyContact {
  _id: string;
  userId: string;
  name: string;
  phone: string;
  relation?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const EmergencyContactSchema = new mongoose.Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "users", required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    relation: { type: String, default: null, trim: true },
  },
  {
    timestamps: true,
  }
);

EmergencyContactSchema.index({ userId: 1, createdAt: -1 });
EmergencyContactSchema.index({ name: "text", phone: "text", relation: "text" });

EmergencyContactSchema.plugin(pM);
