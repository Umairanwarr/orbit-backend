import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { startOfDay, endOfDay } from "date-fns";
import { AppConfigService } from "../../app_config/app_config.service";
import { StoryService } from "../story/story.service";
import {
  StorySubscription,
  StorySubscriptionDocument,
  StorySubscriptionPlan,
} from "./schemas/story-subscription.schema";
import { StoryType } from "../../../core/utils/enums";

@Injectable()
export class StorySubscriptionService {
  constructor(
    private readonly config: ConfigService,
    private readonly appConfigService: AppConfigService,
    private readonly storyService: StoryService,
    @InjectModel(StorySubscription.name)
    private readonly model: Model<StorySubscriptionDocument>,
  ) {}

  async getPlans() {
    const cfg: any = await this.appConfigService.getConfig();
    const weekly = Number(cfg?.storySubscriptionWeeklyFee ?? 0) || 0;
    const monthly = Number(cfg?.storySubscriptionMonthlyFee ?? 0) || 0;
    const quarterly = Number(cfg?.storySubscriptionQuarterlyFee ?? 0) || 0;

    const currency = this._currency();
    const all = [
      {
        key: "weekly" as const,
        title: "Weekly",
        durationDays: 7,
        amount: weekly,
        currency,
      },
      {
        key: "monthly" as const,
        title: "Monthly",
        durationDays: 30,
        amount: monthly,
        currency,
      },
      {
        key: "quarterly" as const,
        title: "Quarterly",
        durationDays: 90,
        amount: quarterly,
        currency,
      },
    ];

    // Only expose plans that admin has priced (> 0), same idea as verification plans
    return all.filter((p) => p.amount > 0);
  }

  async getPlanOrThrow(plan: StorySubscriptionPlan) {
    const plans = await this.getPlans();
    const found = plans.find((p) => p.key === plan);
    if (!found) {
      throw new BadRequestException(
        "This subscription plan is not available. Ask admin to set storySubscriptionWeeklyFee / Monthly / Quarterly in app config.",
      );
    }
    return found;
  }

  async getActive(userId: string) {
    const now = new Date();
    return this.model
      .findOne({
        userId,
        active: true,
        expiresAt: { $gt: now },
      })
      .sort({ expiresAt: -1 })
      .lean();
  }

  async hasActive(userId: string): Promise<boolean> {
    const sub = await this.getActive(userId);
    return !!sub;
  }

  async checkEligibility(userId: string, storyType: StoryType | string) {
    const type = (storyType || "").toString().trim().toLowerCase() as StoryType;
    const freeLimit = 1;
    const gatedTypes = [
      StoryType.Text,
      StoryType.Image,
      StoryType.Video,
      StoryType.Voice,
    ];

    const subscriptionActive = await this.hasActive(userId);

    if (!gatedTypes.includes(type)) {
      return {
        allowed: true,
        storyType: type,
        freeLimit,
        resetPolicy: "calendar_day" as const,
        postedCount: 0,
        postedCountToday: 0,
        subscriptionActive,
      };
    }

    const now = new Date();
    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);
    const postedCountToday = await this.storyService.countStoriesByUserBetween(
      userId,
      dayStart,
      dayEnd,
      gatedTypes,
    );
    const allowed = postedCountToday < freeLimit || subscriptionActive;

    return {
      allowed,
      storyType: type,
      freeLimit,
      resetPolicy: "calendar_day" as const,
      postedCount: postedCountToday,
      postedCountToday,
      subscriptionActive,
    };
  }

  async activate(params: {
    userId: string;
    plan: StorySubscriptionPlan;
    orderTrackingId?: string;
  }) {
    const now = new Date();
    const expiresAt = this._calcExpiry(now, params.plan);

    await this.model.updateMany(
      { userId: params.userId, active: true },
      { $set: { active: false } },
    );

    const doc = await this.model.create({
      userId: params.userId,
      plan: params.plan,
      expiresAt,
      active: true,
      activatedAt: now,
      orderTrackingId: params.orderTrackingId,
    });

    return this.model.findById(doc._id).lean();
  }

  private _currency(): string {
    return (
      this.config.get<string>("STORY_SUBSCRIPTION_CURRENCY") ??
      process.env.STORY_SUBSCRIPTION_CURRENCY ??
      "KES"
    );
  }

  private _calcExpiry(now: Date, plan: StorySubscriptionPlan): Date {
    const days = plan === "weekly" ? 7 : plan === "monthly" ? 30 : 90;
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  }
}
