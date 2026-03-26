import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AppConfigModule } from '../app_config/app_config.module';
import { FileUploaderModule } from '../../common/file_uploader/file_uploader.module';
import { MarketplaceListingSchema } from './marketplace_listing.entity';
import { MarketplaceListingsService } from './marketplace_listings.service';
import { MarketplaceListingsController } from './marketplace_listings.controller';
import { MarketplaceListingsCron } from './marketplace_listings.cron';
import { MarketplaceListingReportSchema } from './marketplace_listing_report.entity';
import { MarketplaceListingReportService } from './marketplace_listing_report.service';
import { OrderRoomSettingsModule } from '../../chat/order_room_settings/order_room_settings.module';
import { UserModule } from '../user_modules/user/user.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'marketplace_listings', schema: MarketplaceListingSchema },
      { name: 'marketplace_listing_reports', schema: MarketplaceListingReportSchema },
    ]),
    AuthModule,
    AppConfigModule,
    FileUploaderModule,
    OrderRoomSettingsModule,
    UserModule,
  ],
  controllers: [MarketplaceListingsController],
  providers: [MarketplaceListingsService, MarketplaceListingReportService, MarketplaceListingsCron],
  exports: [MarketplaceListingsService, MarketplaceListingReportService],
})
export class MarketplaceListingsModule {}
