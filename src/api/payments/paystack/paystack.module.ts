import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { PaystackController } from "./paystack.controller";
import { PaystackService } from "./paystack.service";
import { PaystackTransaction, PaystackTransactionSchema } from "./schemas/paystack-transaction.schema";
import { AuthClientModule } from "src/common/auth_client/auth_client.module";
import { UserModule } from "../../user_modules/user/user.module";
import { VerifiedAuthGuard } from "../../../core/guards/verified.auth.guard";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PaystackTransaction.name, schema: PaystackTransactionSchema },
    ]),
    AuthClientModule,
    UserModule,
  ],
  controllers: [PaystackController],
  providers: [PaystackService, VerifiedAuthGuard],
  exports: [PaystackService],
})
export class PaystackModule {}
