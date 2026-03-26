import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PaginateModel } from 'mongoose';
import { IMarketplaceListingReport } from './marketplace_listing_report.entity';

@Injectable()
export class MarketplaceListingReportService {
  constructor(
    @InjectModel('marketplace_listing_reports')
    private readonly model: PaginateModel<IMarketplaceListingReport>,
  ) {}

  async upsertUserReport(params: {
    userId: string;
    listingId: string;
    content: string;
  }) {
    const content = (params.content ?? '').toString().trim();
    if (!content) {
      throw new BadRequestException('Reason is required');
    }

    const existing = await this.model
      .findOne({ uId: params.userId, listingId: params.listingId })
      .exec();

    if (existing) {
      existing.content = content;
      existing.status = 'pending' as any;
      (existing as any).actionBy = null;
      (existing as any).actionAt = null;
      await existing.save();
      return existing;
    }

    const created = await this.model.create({
      uId: params.userId,
      listingId: params.listingId,
      content,
      status: 'pending',
    } as any);

    return created;
  }

  async findByIdOrThrow(id: string) {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('Report not found');
    return doc;
  }

  async markIgnored(id: string, adminId?: string) {
    const doc = await this.findByIdOrThrow(id);
    (doc as any).status = 'ignored';
    (doc as any).actionBy = adminId ?? null;
    (doc as any).actionAt = new Date();
    await (doc as any).save();
    return doc;
  }

  async markRemoved(id: string, adminId?: string) {
    const doc = await this.findByIdOrThrow(id);
    (doc as any).status = 'removed';
    (doc as any).actionBy = adminId ?? null;
    (doc as any).actionAt = new Date();
    await (doc as any).save();
    return doc;
  }

  paginate(paginationParameters: any[]) {
    return this.model.paginate(...paginationParameters);
  }
}
