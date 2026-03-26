/**
 * Driver Applications Controller
 */
import { Body, BadRequestException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { V1Controller } from '../../core/common/v1-controller.decorator';
import { VerifiedAuthGuard } from '../../core/guards/verified.auth.guard';
import { DriverApplicationsService } from './driver_applications.service';
import { resOK } from '../../core/utils/res.helpers';
import { UserService } from '../user_modules/user/user.service';
import { AppConfigService } from '../app_config/app_config.service';

@V1Controller('drivers')
export class DriverApplicationsController {
  constructor(
    private readonly service: DriverApplicationsService,
    private readonly userService: UserService,
    private readonly appConfigService: AppConfigService,
  ) {}

  @UseGuards(VerifiedAuthGuard)
  @Get('/ride/ban-status')
  async myRideBanStatus(@Req() req: any) {
    const bannedAt = req.user?.rideBannedAt ? new Date(req.user.rideBannedAt) : null;
    const unbannedAt = req.user?.rideUnbannedAt ? new Date(req.user.rideUnbannedAt) : null;
    const isBanned = !!bannedAt && (!unbannedAt || bannedAt.getTime() > unbannedAt.getTime());
    return resOK({
      isBanned,
      reason: isBanned ? (req.user?.rideBanReason ?? null) : null,
      bannedAt: isBanned ? bannedAt?.toISOString?.() ?? null : null,
    });
  }

  // Create a new driver application
  @UseGuards(VerifiedAuthGuard)
  @Post('/applications')
  async create(
    @Req() req: any,
    @Body()
    body: {
      vehicleType: string;
      vehicleModel: string;
      vehiclePlate: string;
      vehicleCapacity?: number;
      idImageUrl?: string;
      selfieImageUrl?: string;
      licenseUrl?: string;
      logbookUrl?: string;
      insuranceUrl?: string;
      inspectionUrl?: string;
      kraPinUrl?: string;
      vehicleImageUrl?: string;
    },
  ) {
    if (!body?.vehicleType || !body?.vehicleModel || !body?.vehiclePlate) {
      throw new BadRequestException('vehicleType, vehicleModel and vehiclePlate are required');
    }
    // If there's already a pending application, don't create a new one
    const latest = await this.service.latestForUser(req.user._id);
    if (latest && (latest as any).status === 'pending') {
      return resOK(latest);
    }

    // Get driver subscription fee from config
    const config = await this.appConfigService.getConfig();
    const fee = Number((config as any)?.driverSubscriptionFee ?? 0) || 0;

    const created = await this.service.create({
      userId: req.user._id,
      status: 'pending',
      feeAtSubmission: fee,
      paidVia: fee > 0 ? 'wallet' : null,
      ...body,
    });
    const doc = Array.isArray(created) ? created[0] : created;

    // Deduct fee from wallet if fee > 0
    if (fee > 0) {
      try {
        await this.userService.subtractFromBalanceAtomic(req.user._id.toString(), fee);
      } catch (e) {
        // If deduction fails, mark request as rejected and surface error
        try {
          await this.service.findByIdAndUpdate((doc as any)._id?.toString?.() ?? (doc as any).id, {
            status: 'rejected',
            note: 'Insufficient balance',
          } as any);
        } catch (_) {}
        throw new BadRequestException('Insufficient wallet balance to pay driver subscription fee');
      }
    }

    return resOK(doc);
  }

  // Get my latest application
  @UseGuards(VerifiedAuthGuard)
  @Get('/applications/my-latest')
  async myLatest(@Req() req: any) {
    const latest = await this.service.latestForUser(req.user._id);
    return resOK(latest);
  }
}
