import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PaginateModel } from 'mongoose';
import { IArticleReport } from './article_report.entity';

@Injectable()
export class ArticleReportService {
  constructor(
    @InjectModel('article_reports')
    private readonly model: PaginateModel<IArticleReport>,
  ) {}

  async upsertUserReport(params: {
    userId: string;
    articleId: string;
    content: string;
  }) {
    const content = (params.content ?? '').toString().trim();
    if (!content) {
      throw new BadRequestException('Reason is required');
    }

    const existing = await this.model
      .findOne({ uId: params.userId, articleId: params.articleId } as any)
      .exec();

    if (existing) {
      (existing as any).content = content;
      (existing as any).status = 'pending';
      (existing as any).actionBy = null;
      (existing as any).actionAt = null;
      await (existing as any).save();
      return existing;
    }

    const created = await this.model.create({
      uId: params.userId,
      articleId: params.articleId as any,
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

  deleteByArticleId(articleId: any) {
    return this.model.deleteMany({ articleId } as any);
  }

  paginate(paginationParameters: any[]) {
    return this.model.paginate(...paginationParameters);
  }
}
