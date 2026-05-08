import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../../auth/auth.module";
import { AppConfigModule } from "../../app_config/app_config.module";
import { PesapalModule } from "../../payments/pesapal/pesapal.module";
import { StorySubscriptionController } from "./story_subscription.controller";
import { StorySubscriptionService } from "./story_subscription.service";
import {
  StorySubscription,
  StorySubscriptionSchema,
} from "./schemas/story-subscription.schema";

@Module({
  imports: [
    ConfigModule,
    AppConfigModule,
    AuthModule,
    PesapalModule,
    MongooseModule.forFeature([
      { name: StorySubscription.name, schema: StorySubscriptionSchema },
    ]),
  ],
  controllers: [StorySubscriptionController],
  providers: [StorySubscriptionService],
  exports: [StorySubscriptionService],
})
export class StorySubscriptionModule {}

