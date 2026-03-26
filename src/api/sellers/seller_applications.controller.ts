import { Body, Get, Post, Req, UseGuards } from '@nestjs/common';
import { V1Controller } from '../../core/common/v1-controller.decorator';
import { VerifiedAuthGuard } from '../../core/guards/verified.auth.guard';
import { SellerApplicationsService } from './seller_applications.service';
import { resOK } from '../../core/utils/res.helpers';

@V1Controller('sellers')
export class SellerApplicationsController {
  constructor(private readonly service: SellerApplicationsService) {}

  @UseGuards(VerifiedAuthGuard)
  @Post('/applications')
  async create(
    @Req() req: any,
    @Body()
    body: {
      idImageUrl: string;
    },
  ) {
    if (!body?.idImageUrl) {
      throw new Error('idImageUrl is required');
    }

    const latest = await this.service.latestForUser(req.user._id);
    if (latest && (latest as any).status === 'pending') {
      return resOK(latest);
    }

    const created = await this.service.create({
      userId: req.user._id,
      status: 'pending',
      ...body,
    });
    const doc = Array.isArray(created) ? created[0] : created;
    return resOK(doc);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get('/applications/my-latest')
  async myLatest(@Req() req: any) {
    const latest = await this.service.latestForUser(req.user._id);
    return resOK(latest);
  }
}
