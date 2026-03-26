import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, PaginateModel, QueryOptions } from 'mongoose';
import { ISellerApplication } from './seller_application.entity';

@Injectable()
export class SellerApplicationsService {
  constructor(
    @InjectModel('seller_applications')
    private readonly model: PaginateModel<ISellerApplication>,
  ) {}

  create(obj: Partial<ISellerApplication>) {
    return this.model.create(obj as any);
  }

  findAll(filter: FilterQuery<ISellerApplication> = {}, options?: QueryOptions<ISellerApplication>) {
    return this.model.find(filter, null, options).sort({ createdAt: -1 });
  }

  paginate(paginationParameters: any[]) {
    return this.model.paginate(...paginationParameters);
  }

  findOne(filter: FilterQuery<ISellerApplication>) {
    return this.model.findOne(filter);
  }

  findById(id: string) {
    return this.model.findById(id);
  }

  findByIdAndUpdate(id: string, update: Partial<ISellerApplication>) {
    return this.model.findByIdAndUpdate(id, update, { new: true });
  }

  findByIdAndDelete(id: string) {
    return this.model.findByIdAndDelete(id);
  }

  async latestForUser(userId: string) {
    return this.model.findOne({ userId }).sort({ createdAt: -1 }).exec();
  }
}
