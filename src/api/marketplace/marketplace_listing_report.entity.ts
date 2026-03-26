import mongoose from 'mongoose';
import pM from 'mongoose-paginate-v2';

export type MarketplaceListingReportStatus = 'pending' | 'ignored' | 'removed';

export interface IMarketplaceListingReport {
  uId: string;
  listingId: string;
  content: string;
  status: MarketplaceListingReportStatus;
  actionBy?: string;
  actionAt?: Date;
}

export const MarketplaceListingReportSchema = new mongoose.Schema(
  {
    uId: { type: String, required: true, ref: 'user', index: true },
    listingId: {
      type: String,
      required: true,
      ref: 'marketplace_listings',
      index: true,
    },
    content: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'ignored', 'removed'],
      default: 'pending',
      index: true,
    },
    actionBy: { type: String, default: null, ref: 'user' },
    actionAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

MarketplaceListingReportSchema.index({ uId: 1, listingId: 1 }, { unique: true });
MarketplaceListingReportSchema.plugin(pM);
