import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, PaginateModel, QueryOptions, UpdateQuery } from 'mongoose';
import { IEmergencyContact } from './emergency_contact.entity';

@Injectable()
export class EmergencyContactService {
  constructor(
    @InjectModel('emergency_contacts')
    private readonly model: PaginateModel<IEmergencyContact>,
  ) {}

  create(obj: Partial<IEmergencyContact>) {
    return this.model.create(obj as any);
  }

  findAll(filter: FilterQuery<IEmergencyContact> = {}, select?: string | null, options?: QueryOptions<IEmergencyContact>) {
    return this.model.find(filter, select as any, options).sort({ createdAt: -1 });
  }

  paginate(paginationParameters: any[]) {
    return (this.model as any).paginate(...paginationParameters);
  }

  findOne(filter: FilterQuery<IEmergencyContact>, select?: string) {
    return this.model.findOne(filter, select as any);
  }

  findById(id: string, select?: string) {
    return this.model.findById(id, select as any);
  }

  findByIdAndUpdate(id: string, update: UpdateQuery<IEmergencyContact>) {
    return this.model.findByIdAndUpdate(id, update, { new: true });
  }

  findByIdAndDelete(id: string) {
    return this.model.findByIdAndDelete(id);
  }
}
