import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, PaginateModel, QueryOptions } from 'mongoose';
import { IWithdrawRequest } from './withdraw_request.entity';

@Injectable()
export class WithdrawRequestsService {
  constructor(
    @InjectModel('withdraw_requests')
    private readonly model: PaginateModel<IWithdrawRequest>,
  ) {}

  create(obj: Partial<IWithdrawRequest>) {
    return this.model.create(obj as any);
  }

  findAll(
    filter: FilterQuery<IWithdrawRequest> = {},
    options?: QueryOptions<IWithdrawRequest>,
  ) {
    return this.model.find(filter, null, options).sort({ createdAt: -1 });
  }

  paginate(paginationParameters: any[]) {
    return this.model.paginate(...paginationParameters);
  }

  findOne(filter: FilterQuery<IWithdrawRequest>) {
    return this.model.findOne(filter);
  }

  findById(id: string) {
    return this.model.findById(id);
  }

  findByIdAndUpdate(id: string, update: Partial<IWithdrawRequest>) {
    return this.model.findByIdAndUpdate(id, update, { new: true });
  }

  findByIdAndDelete(id: string) {
    return this.model.findByIdAndDelete(id);
  }
}
