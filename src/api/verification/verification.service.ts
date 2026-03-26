/**
 * Copyright 2025
 */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, PaginateModel, QueryOptions } from 'mongoose';
import { IVerificationRequest } from './verification_request.entity';

@Injectable()
export class VerificationService {
  constructor(
    @InjectModel('verification_requests')
    private readonly model: PaginateModel<IVerificationRequest>,
  ) {}

  create(obj: Partial<IVerificationRequest>) {
    return this.model.create(obj as any);
  }

  findAll(filter: FilterQuery<IVerificationRequest> = {}, options?: QueryOptions<IVerificationRequest>) {
    return this.model.find(filter, null, options).sort({ createdAt: -1 });
  }

  paginate(paginationParameters: any[]) {
    return this.model.paginate(...paginationParameters);
  }

  findOne(filter: FilterQuery<IVerificationRequest>) {
    return this.model.findOne(filter);
  }

  findById(id: string) {
    return this.model.findById(id);
  }

  findByIdAndUpdate(id: string, update: Partial<IVerificationRequest>) {
    return this.model.findByIdAndUpdate(id, update, { new: true });
  }

  findByIdAndDelete(id: string) {
    return this.model.findByIdAndDelete(id);
  }

  async latestForUser(userId: string) {
    return this.model.findOne({ userId }).sort({ createdAt: -1 }).exec();
  }
}
