import { IsIn, IsOptional, IsString } from "class-validator";
import { StorySubscriptionPlan } from "../schemas/story-subscription.schema";

export class CreateStorySubscriptionDto {
  @IsIn(["weekly", "monthly", "quarterly"])
  plan: StorySubscriptionPlan;

  @IsOptional()
  @IsString()
  currency?: string;
}

