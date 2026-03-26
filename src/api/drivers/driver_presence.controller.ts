import { Body, Post, Req, UseGuards } from '@nestjs/common';
import { V1Controller } from '../../core/common/v1-controller.decorator';
import { VerifiedAuthGuard } from '../../core/guards/verified.auth.guard';
import { DriverPresenceService } from './driver_presence.service';
import { resOK } from '../../core/utils/res.helpers';

@V1Controller('drivers/presence')
export class DriverPresenceController {
  constructor(private readonly service: DriverPresenceService) {}

  @UseGuards(VerifiedAuthGuard)
  @Post('online')
  async online(
    @Req() req: any,
    @Body() body: { lat: number; lng: number; vehicleType?: string },
  ) {
    if (typeof body?.lat !== 'number' || typeof body?.lng !== 'number') {
      throw new Error('lat and lng are required');
    }
    await this.service.upsertPresence({
      userId: req.user._id,
      lat: body.lat,
      lng: body.lng,
      vehicleType: body.vehicleType,
    });
    return resOK({ ok: true });
  }

  @UseGuards(VerifiedAuthGuard)
  @Post('offline')
  async offline(@Req() req: any) {
    await this.service.removePresence(req.user._id);
    return resOK({ ok: true });
  }
}
