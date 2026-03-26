import { Body, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { V1Controller } from '../../core/common/v1-controller.decorator';
import { VerifiedAuthGuard } from '../../core/guards/verified.auth.guard';
import { resOK } from '../../core/utils/res.helpers';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IRating } from './rating.entity';

@V1Controller('ratings')
export class RatingsController {
  constructor(
    @InjectModel('Rating') private readonly ratingModel: Model<IRating>,
  ) {}

  @UseGuards(VerifiedAuthGuard)
  @Post('submit')
  async submit(
    @Req() req: any,
    @Body() body: { rideId: string; rateeId: string; stars: number; comment?: string },
  ) {
    const raterId = new Types.ObjectId(req.user._id);
    const rideId = new Types.ObjectId(body.rideId);
    const rateeId = new Types.ObjectId(body.rateeId);
    const stars = Number(body.stars);
    if (!(stars >= 1 && stars <= 5)) {
      throw new Error('stars must be 1..5');
    }
    await this.ratingModel.updateOne(
      { rideId, raterId },
      { $set: { rideId, raterId, rateeId, stars, comment: body.comment ?? null } },
      { upsert: true },
    );
    return resOK({ ok: true });
  }

  @UseGuards(VerifiedAuthGuard)
  @Get('me')
  async mySummary(@Req() req: any) {
    const userId = new Types.ObjectId(req.user._id);
    const agg = await this.ratingModel.aggregate([
      { $match: { rateeId: userId } },
      { $group: { _id: '$rateeId', count: { $sum: 1 }, avg: { $avg: '$stars' } } },
      { $project: { _id: 0, count: 1, avg: { $round: ['$avg', 2] } } },
    ]);
    const summary = agg[0] || { count: 0, avg: 0 };
    return resOK(summary);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get('summary/:userId')
  async summary(@Param('userId') userId: string) {
    const uid = new Types.ObjectId(userId);
    const agg = await this.ratingModel.aggregate([
      { $match: { rateeId: uid } },
      { $group: { _id: '$rateeId', count: { $sum: 1 }, avg: { $avg: '$stars' } } },
      { $project: { _id: 0, count: 1, avg: { $round: ['$avg', 2] } } },
    ]);
    const summary = agg[0] || { count: 0, avg: 0 };
    return resOK(summary);
  }
}
