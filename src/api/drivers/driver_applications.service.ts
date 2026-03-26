/**
 * Driver Applications Service
 */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, PaginateModel, QueryOptions } from 'mongoose';
import { IDriverApplication } from './driver_application.entity';

@Injectable()
export class DriverApplicationsService {
  constructor(
    @InjectModel('driver_applications')
    private readonly model: PaginateModel<IDriverApplication>,
  ) {}

  create(obj: Partial<IDriverApplication>) {
    return this.model.create(obj as any);
  }

  findAll(filter: FilterQuery<IDriverApplication> = {}, options?: QueryOptions<IDriverApplication>) {
    return this.model.find(filter, null, options).sort({ createdAt: -1 });
  }

  paginate(paginationParameters: any[]) {
    return this.model.paginate(...paginationParameters);
  }

  findOne(filter: FilterQuery<IDriverApplication>) {
    return this.model.findOne(filter);
  }

  findById(id: string) {
    return this.model.findById(id);
  }

  findByIdAndUpdate(id: string, update: Partial<IDriverApplication>) {
    return this.model.findByIdAndUpdate(id, update, { new: true });
  }

  findByIdAndDelete(id: string) {
    return this.model.findByIdAndDelete(id);
  }

  async latestForUser(userId: string) {
    return this.model.findOne({ userId }).sort({ createdAt: -1 }).exec();
  }
}
