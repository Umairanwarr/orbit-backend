import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarketplaceListingsService } from './marketplace_listings.service';

@Injectable()
export class MarketplaceListingsCron {
  private readonly logger = new Logger('MarketplaceListingsCron');

  constructor(private readonly listings: MarketplaceListingsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireDue() {
    try {
      const n = await this.listings.expireDue();
      if (n > 0) {
        this.logger.log(`Expired ${n} marketplace listings`);
      }
    } catch (e: any) {
      this.logger.error(`expireDue failed: ${e?.message || e}`);
    }
  }
}
