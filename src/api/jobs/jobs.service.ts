import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery, Types } from 'mongoose';
import { IJob } from './job.entity';
import { IJobSeekerProfile } from './job_seeker_profile.entity';

@Injectable()
export class JobsService {
  constructor(
    @InjectModel('Job') private readonly jobModel: Model<IJob>,
    @InjectModel('JobSeekerProfile') private readonly profileModel: Model<IJobSeekerProfile>,
    @InjectModel('User') private readonly userModel: Model<any>,
  ) {}

  async createJob(userId: string, body: any) {
    const doc = await this.jobModel.create({
      title: (body.title || '').toString(),
      description: (body.description || '').toString(),
      qualifications: (body.qualifications || '').toString(),
      category: (body.category || '').toString(),
      location: (body.location || '').toString(),
      salaryMin: body.salaryMin != null ? Number(body.salaryMin) : undefined,
      salaryMax: body.salaryMax != null ? Number(body.salaryMax) : undefined,
      posterId: new Types.ObjectId(userId),
    });
    return doc;
  }

  async list(params: any) {
    const page = parseInt(params.page) || 1;
    const limit = Math.min(parseInt(params.limit) || 20, 100);

    const q: FilterQuery<IJob> = {};
    const search = (params.q || '').toString().trim();
    if (search) {
      q.$text = { $search: search } as any;
    }
    if (params.category) {
      q.category = params.category.toString();
    }
    if (params.location) {
      q.location = { $regex: params.location.toString(), $options: 'i' } as any;
    }

    const [docs, total] = await Promise.all([
      this.jobModel.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.jobModel.countDocuments(q),
    ]);

    return {
      docs,
      page,
      limit,
      total,
    };
  }

  async getById(id: string) {
    return await this.jobModel.findById(id).lean();
  }

  async updateJob(userId: string, id: string, body: any) {
    const job: any = await this.jobModel.findById(id);
    if (!job) throw new NotFoundException('Job not found');

    const isOwner =
      job.posterId?.equals?.(userId) === true ||
      (job.posterId?.toString?.() ?? job.posterId)?.toString?.() === userId;
    if (!isOwner) {
      throw new ForbiddenException('You can only update your own job posts');
    }

    const set: any = {};
    const unset: any = {};

    if (body.title != null) set.title = body.title.toString().trim();
    if (body.description != null) set.description = body.description.toString();
    if (body.qualifications != null) set.qualifications = body.qualifications.toString();
    if (body.category != null) set.category = body.category.toString();
    if (body.location != null) set.location = body.location.toString();

    if (Object.prototype.hasOwnProperty.call(body, 'salaryMin')) {
      if (body.salaryMin === null || body.salaryMin === '') {
        unset.salaryMin = 1;
      } else {
        set.salaryMin = Number(body.salaryMin);
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'salaryMax')) {
      if (body.salaryMax === null || body.salaryMax === '') {
        unset.salaryMax = 1;
      } else {
        set.salaryMax = Number(body.salaryMax);
      }
    }

    const update: any = {};
    if (Object.keys(set).length > 0) update.$set = set;
    if (Object.keys(unset).length > 0) update.$unset = unset;

    const updated = await this.jobModel.findByIdAndUpdate(id, update, { new: true }).lean();
    return updated;
  }

  async deleteJob(userId: string, id: string) {
    const job: any = await this.jobModel.findById(id);
    if (!job) throw new NotFoundException('Job not found');

    const isOwner =
      job.posterId?.equals?.(userId) === true ||
      (job.posterId?.toString?.() ?? job.posterId)?.toString?.() === userId;
    if (!isOwner) {
      throw new ForbiddenException('You can only delete your own job posts');
    }

    await this.jobModel.deleteOne({ _id: id });
    return { deleted: true };
  }

  getCategories(): string[] {
    return [
      'IT & Software',
      'Sales',
      'Customer Support',
      'Driver',
      'Logistics',
      'Accounting',
      'Finance',
      'Marketing',
      'Education',
      'Healthcare',
      'Construction',
      'Hospitality',
      'Security',
      'Admin',
      'Other',
    ];
  }

  async getMyProfile(userId: string) {
    return await this.profileModel.findOne({ userId }).lean();
  }

  async getProfile(userId: string) {
    return await this.profileModel.findOne({ userId }).lean();
  }

  async upsertMyProfile(userId: string, body: any) {
    const update: any = {};
    if (body.skills != null) update.skills = body.skills.toString();
    if (body.yearsExperience != null) update.yearsExperience = Number(body.yearsExperience);
    if (body.cvUrl != null) update.cvUrl = body.cvUrl.toString();

    const res = await this.profileModel.findOneAndUpdate(
      { userId },
      { $set: update, $setOnInsert: { userId } },
      { upsert: true, new: true },
    ).lean();
    return res;
  }

  async getPublicJob(id: string) {
    const job = await this.jobModel.findById(id).lean();
    if (!job) throw new NotFoundException('Job not found');

    // Get poster info
    let posterName = '';
    let posterImage = '';
    if (job.posterId) {
      const poster: any = await this.userModel
        .findById(job.posterId)
        .select('fullName userImage')
        .lean();
      if (poster) {
        posterName = poster.fullName || '';
        posterImage = poster.userImage || '';
      }
    }

    return {
      _id: (job as any)._id,
      title: job.title,
      description: job.description,
      qualifications: job.qualifications,
      category: job.category,
      location: job.location,
      salaryMin: job.salaryMin ?? null,
      salaryMax: job.salaryMax ?? null,
      posterName,
      posterImage,
      posterId: (job.posterId as any)?.toString?.() ?? null,
      createdAt: job.createdAt,
    };
  }
}
