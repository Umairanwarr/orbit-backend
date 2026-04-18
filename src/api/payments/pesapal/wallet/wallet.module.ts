import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { WalletController } from "./wallet.controller";
import { WalletService } from "./wallet.service";
import { EscrowSettlementService } from "./escrow-settlement.cron";

// Import Schemas
import { WalletTransfer, WalletTransferSchema } from "./wallet-transfer.schema";
import { UserSchema } from "src/api/user_modules/user/entities/user.entity";
import { AppConfigSchema } from "src/api/app_config/entities/app_config.entity";
import { AuthModule } from "src/api/auth/auth.module";

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: WalletTransfer.name, schema: WalletTransferSchema },
      { name: "User", schema: UserSchema },
      { name: "AppConfig", schema: AppConfigSchema },
    ]),
  ],
  controllers: [WalletController],
  providers: [WalletService, EscrowSettlementService],
  exports: [WalletService], // Exported in case the Ticketing system needs to trigger transfers later
})
export class WalletModule {}
