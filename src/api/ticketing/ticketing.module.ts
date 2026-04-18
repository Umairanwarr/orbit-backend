import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { TicketingController } from "./ticketing.controller";
import { TicketingService } from "./ticketing.service";

// Schemas
import { TicketEvent, TicketEventSchema } from "./entity/ticket-event.schema";
import {
  TicketPurchase,
  TicketPurchaseSchema,
} from "./entity/ticket-purchase.schema";
import { UserSchema } from "../user_modules/user/entities/user.entity";
import { AppConfigSchema } from "../app_config/entities/app_config.entity";
import { AppConfigModule } from "../app_config/app_config.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    AppConfigModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: TicketEvent.name, schema: TicketEventSchema },
      { name: TicketPurchase.name, schema: TicketPurchaseSchema },
      { name: "User", schema: UserSchema },
      { name: "AppConfig", schema: AppConfigSchema },
    ]),
  ],
  controllers: [TicketingController],
  providers: [TicketingService],
})
export class TicketingModule {}
