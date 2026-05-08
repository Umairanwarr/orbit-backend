import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type StorySubscriptionDocument = HydratedDocument<StorySubscription>;

export type StorySubscriptionPlan = "weekly" | "monthly" | "quarterly";

@Schema({ timestamps: true, collection: "story_subscriptions" })
export class StorySubscription {
  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({ type: String, enum: ["weekly", "monthly", "quarterly"], required: true })
  plan: StorySubscriptionPlan;

  @Prop({ type: Date, required: true, index: true })
  expiresAt: Date;

  @Prop({ type: Boolean, default: true, index: true })
  active: boolean;

  @Prop({ type: Date, required: false })
  activatedAt?: Date;

  @Prop({ type: String, required: false, index: true })
  orderTrackingId?: string;
}

export const StorySubscriptionSchema =
  SchemaFactory.createForClass(StorySubscription);

