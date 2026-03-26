/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PaginateModel } from 'mongoose';
import { IAd } from './entities/ad.entity';
import { UserService } from '../user_modules/user/user.service';

@Injectable()
export class AdsService {
  constructor(
    @InjectModel('Ad') private readonly adModel: PaginateModel<IAd>,
    private readonly userService: UserService,
  ) {}

  async create(data: Partial<IAd>) {
    return this.adModel.create({
      ...data,
      status: 'pending',
      isActive: true,
    });
  }

  async findById(id: string) {
    return this.adModel.findById(id);
  }

  async paginate(pagination: [any, any]) {
    return this.adModel.paginate(pagination[0], pagination[1]);
  }

  async getApprovedActive(limit = 10) {
    return this.adModel
      .find({ status: 'approved', isActive: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  async getUserAds(userId: string, pagination: [any, any]) {
    pagination[0] = { ...(pagination[0] || {}), userId };
    return this.adModel.paginate(pagination[0], pagination[1]);
  }

  async review(id: string, status: 'approved' | 'rejected', note?: string, reviewerId?: string) {
    const ad = await this.adModel.findById(id);
    if (!ad) throw new NotFoundException('Ad not found');

    // Refund wallet fee if admin rejects and it hasn't been refunded yet
    if (
      status === 'rejected' &&
      (ad.feeAtSubmission ?? 0) > 0 &&
      !(ad as any).refundedAt
    ) {
      const amount = Number(ad.feeAtSubmission ?? 0);
      try {
        await this.userService.addToBalance(ad.userId?.toString?.() ?? (ad as any).userId, amount);
        (ad as any).refundedAt = new Date();
        (ad as any).refundedAmount = amount;
      } catch (_) {
        // If refund fails, do not mark it as refunded
      }
    }

    ad.status = status as any;
    (ad as any).note = note ?? null;
    (ad as any).reviewedBy = reviewerId ?? null;
    (ad as any).reviewedAt = new Date();
    await ad.save();
    return ad;
  }

  async delete(id: string) {
    await this.adModel.findByIdAndDelete(id);
    return 'Ad deleted';
  }
}
