import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { MpesaController } from "./mpesa.controller";
import { MpesaService } from "./mpesa.service";
import { MpesaTransaction, MpesaTransactionSchema } from "./schemas/mpesa-transaction.schema";
import { RecordingPurchase, RecordingPurchaseSchema } from "../../live_stream/schemas/recording_purchase.schema";
import { GiftPurchaseSchema } from "../../live_stream/schemas/gift_purchase.schema";
import { SupportDonationSchema } from "../../live_stream/schemas/support_donation.schema";
import { MusicSupportSchema } from "../../music/schemas/music_support.schema";
import { ArticleSupportSchema } from "../../articles/schemas/article_support.schema";
import { AdSubmissionSchema } from "../../ads/schemas/ad_submission.schema";
import { AuthClientModule } from "src/common/auth_client/auth_client.module";
import { UserModule } from "../../user_modules/user/user.module";
import { AdsModule } from "../../ads/ads.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MpesaTransaction.name, schema: MpesaTransactionSchema },
      { name: RecordingPurchase.name, schema: RecordingPurchaseSchema },
      { name: 'GiftPurchase', schema: GiftPurchaseSchema },
      { name: 'SupportDonation', schema: SupportDonationSchema },
      { name: 'MusicSupport', schema: MusicSupportSchema },
      { name: 'ArticleSupport', schema: ArticleSupportSchema },
      { name: 'AdSubmission', schema: AdSubmissionSchema },
    ]),
    AuthClientModule,
    UserModule,
    AdsModule,
  ],
  controllers: [MpesaController],
  providers: [MpesaService],
  exports: [MpesaService],
})
export class MpesaModule {}
