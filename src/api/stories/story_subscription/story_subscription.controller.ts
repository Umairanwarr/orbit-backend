import { Body, Get, HttpException, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { V1Controller } from "../../../core/common/v1-controller.decorator";
import { VerifiedAuthGuard } from "../../../core/guards/verified.auth.guard";
import { resOK } from "../../../core/utils/res.helpers";
import { PesapalService } from "../../payments/pesapal/pesapal.service";
import { CreateStorySubscriptionDto } from "./dto/create-story-subscription.dto";
import { ConfirmStorySubscriptionDto } from "./dto/confirm-story-subscription.dto";
import { StorySubscriptionService } from "./story_subscription.service";

@UseGuards(VerifiedAuthGuard)
@V1Controller("story-subscriptions")
export class StorySubscriptionController {
  constructor(
    private readonly subs: StorySubscriptionService,
    private readonly pesapal: PesapalService,
  ) {}

  @Get("/plans")
  async plans() {
    return resOK(await this.subs.getPlans());
  }

  @Get("/me")
  async me(@Req() req: any) {
    const userId = req.user?._id?.toString();
    const active = await this.subs.getActive(userId);
    return resOK({ active: !!active, subscription: active || null });
  }

  @Post("/subscribe")
  async subscribe(@Req() req: any, @Body() dto: CreateStorySubscriptionDto) {
    const userId = req.user?._id?.toString();
    const plan = await this.subs.getPlanOrThrow(dto.plan);

    const result = await this.pesapal.submitOrder({
      userId,
      amount: plan.amount,
      currency: (dto.currency || plan.currency || "KES").toUpperCase(),
      description: `Story subscription (${dto.plan})`,
      accountReference: `STORY-SUB-${dto.plan.toUpperCase()}-${Date.now()}`,
      type: "STORY_SUBSCRIPTION",
      planKey: dto.plan,
    } as any);

    return resOK(result);
  }

  @Post("/confirm")
  async confirm(@Req() req: any, @Body() dto: ConfirmStorySubscriptionDto) {
    const userId = req.user?._id?.toString();
    const verify = await this.pesapal.verifyTransaction({
      userId,
      orderTrackingId: dto.orderTrackingId,
    });

    const isSuccess = (verify?.status || "").toString() === "success";
    if (!isSuccess) {
      throw new HttpException(
        { message: "Payment not completed", status: verify?.status || "pending" },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const tx: any = await this.pesapal.findTxByOrderTrackingId(
      dto.orderTrackingId,
      userId,
    );
    if (tx?.type !== "STORY_SUBSCRIPTION") {
      throw new HttpException(
        { message: "Not a subscription payment", type: tx?.type },
        HttpStatus.BAD_REQUEST,
      );
    }

    const planKey = (tx?.planKey || "").toString().trim().toLowerCase();
    if (!["weekly", "monthly", "quarterly"].includes(planKey)) {
      throw new HttpException(
        { message: "Subscription plan not found on transaction" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const sub = await this.subs.activate({
      userId,
      plan: planKey as any,
      orderTrackingId: dto.orderTrackingId,
    });

    return resOK({ active: true, subscription: sub });
  }
}

