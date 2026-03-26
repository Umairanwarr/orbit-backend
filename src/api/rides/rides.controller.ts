import { Body, Post, Req, UseGuards, Get, Param, Query } from '@nestjs/common';
import { V1Controller } from '../../core/common/v1-controller.decorator';
import { VerifiedAuthGuard } from '../../core/guards/verified.auth.guard';
import { resOK } from '../../core/utils/res.helpers';
import { DriverPresenceService } from '../drivers/driver_presence.service';
import { SocketIoService } from '../../chat/socket_io/socket_io.service';
import { RidesService } from './rides.service';

function isBikeFamily(s?: string) {
  const v = (s || '').toLowerCase();
  return v.includes('bike') || v.includes('motor');
}

function toAbsoluteMediaUrl(url?: string, req?: any): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  // Convert file:// URIs to http(s) absolute
  if (/^file:\/\//i.test(url)) {
    const trimmed = url.replace(/^file:\/\//i, '');
    url = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }
  const proto = (req?.headers?.['x-forwarded-proto'] as string) || req?.protocol || 'http';
  const host = (req?.headers?.['x-forwarded-host'] as string) || req?.get?.('host') || 'localhost';
  const base = `${proto}://${host}`;
  if (url.startsWith('/')) return `${base}${url}`;
  return `${base}/${url}`;
}

@V1Controller('rides')
export class RidesController {
  constructor(
    private readonly presence: DriverPresenceService,
    private readonly socketIo: SocketIoService,
    private readonly ridesService: RidesService,
  ) {}

  @UseGuards(VerifiedAuthGuard)
  @Post('request')
  async request(
    @Req() req: any,
    @Body()
    body: {
      pickupAddress: string;
      dropoffAddress: string;
      pickupLat: number;
      pickupLng: number;
      dropoffLat: number;
      dropoffLng: number;
      fareKes: number;
      rideType?: string;
      radiusKm?: number;
      paymentMethod?: string; // 'cash' | 'online'
      passengersCount?: number;
    },
  ) {
    const {
      pickupAddress,
      dropoffAddress,
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
      fareKes,
      rideType,
      paymentMethod,
      passengersCount,
    } = body;

    if (
      typeof pickupLat !== 'number' ||
      typeof pickupLng !== 'number' ||
      typeof dropoffLat !== 'number' ||
      typeof dropoffLng !== 'number'
    ) {
      throw new Error('pickupLat, pickupLng, dropoffLat, dropoffLng are required numbers');
    }

    const family = rideType ? (isBikeFamily(rideType) ? 'bike' : 'car') : undefined;

    // Round 1: 5 km (exact category if provided)
    let drivers = await this.presence.findNearby({
      lat: pickupLat,
      lng: pickupLng,
      radiusKm: body.radiusKm ?? 5,
      vehicleTypeExact: rideType,
      family: rideType ? undefined : (family as any),
    });

    // Round 2: widen to 50 km if none
    if (!drivers?.length) {
      drivers = await this.presence.findNearby({
        lat: pickupLat,
        lng: pickupLng,
        radiusKm: 50,
        vehicleTypeExact: rideType,
        family: rideType ? undefined : (family as any),
      });
    }

    // Round 3: if still none, broadcast to all online drivers
    // We can query presence collection without geo filter, but keep it limited
    if (!drivers?.length) {
      drivers = await this.presence.findNearby({
        lat: pickupLat,
        lng: pickupLng,
        radiusKm: 20000, // world-wide search
        vehicleTypeExact: rideType,
        family: rideType ? undefined : (family as any),
      });
    }

    const requestId = `req_${Date.now()}`;
    const payload = {
      id: requestId,
      passengerId: req.user._id,
      passengerName: req.user.fullName,
      passengerPhotoUrl: toAbsoluteMediaUrl(req.user.userImage, req),
      pickupAddress,
      dropoffAddress,
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
      fareKes,
      rideType,
      paymentMethod: (paymentMethod || 'cash').toLowerCase(),
      passengersCount: typeof passengersCount === 'number' && passengersCount > 0 ? Math.floor(passengersCount) : 1,
      createdAt: new Date().toISOString(),
    };

    let dispatched = 0;
    for (const d of drivers) {
      try {
        this.socketIo.io.to(d.userId.toString()).emit('ride_request', payload);
        dispatched++;
      } catch (_) {}
    }

    return resOK({ dispatched });
  }

  // Schedule a ride in the future
  @UseGuards(VerifiedAuthGuard)
  @Post('schedule')
  async schedule(
    @Req() req: any,
    @Body()
    body: {
      pickupAddress: string;
      dropoffAddress: string;
      pickupLat: number;
      pickupLng: number;
      dropoffLat: number;
      dropoffLng: number;
      fareKes: number;
      rideType?: string;
      paymentMethod?: string;
      scheduledAt: string; // ISO date
      passengersCount?: number;
    },
  ) {
    const created = await this.ridesService.schedule({ userId: req.user._id, body });
    return resOK(created);
  }

  // List my scheduled rides
  @UseGuards(VerifiedAuthGuard)
  @Get('scheduled')
  async myScheduled(@Req() req: any) {
    const list = await this.ridesService.myScheduledRides({ userId: req.user._id });
    return resOK(list);
  }

  // Cancel a scheduled ride
  @UseGuards(VerifiedAuthGuard)
  @Post('scheduled/:id/cancel')
  async cancelScheduled(@Req() req: any, @Param('id') id: string) {
    const r = await this.ridesService.cancelScheduled({ userId: req.user._id, id });
    return resOK(r);
  }

  // Reschedule a scheduled ride time
  @UseGuards(VerifiedAuthGuard)
  @Post('scheduled/:id/reschedule')
  async reschedule(@Req() req: any, @Param('id') id: string, @Body() body: { scheduledAt: string }) {
    const r = await this.ridesService.rescheduleScheduled({ userId: req.user._id, id, scheduledAt: body.scheduledAt });
    return resOK(r);
  }

  // Debug: list my scheduled rides with timer status
  @UseGuards(VerifiedAuthGuard)
  @Get('scheduled/debug')
  async debugScheduled(@Req() req: any) {
    const r = await this.ridesService.debugScheduled({ userId: req.user._id });
    return resOK(r);
  }

  // Dev: force dispatch a scheduled ride now
  @UseGuards(VerifiedAuthGuard)
  @Post('scheduled/:id/dispatch-now')
  async forceDispatch(@Req() req: any, @Param('id') id: string) {
    const r = await this.ridesService.forceDispatchScheduled({ userId: req.user._id, id });
    return resOK(r);
  }

  @UseGuards(VerifiedAuthGuard)
  @Post('accept')
  async accept(@Req() req: any, @Body() body: {
    requestId: string;
    passengerId: string;
    pickupAddress: string;
    dropoffAddress: string;
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    fareKes: number;
    rideType?: string;
    passengersCount?: number;
  }) {
    const ride = await this.ridesService.accept({
      req,
      driverId: req.user._id,
      body,
    });
    return resOK({ rideId: ride._id.toString() });
  }

  @UseGuards(VerifiedAuthGuard)
  @Post(':rideId/driver-location')
  async driverLocation(@Req() _req: any, @Body() body: { rideId: string; passengerId: string; lat: number; lng: number }) {
    const { rideId, passengerId, lat, lng } = body;
    await this.ridesService.sendDriverLocation({ rideId, passengerId, lat, lng });
    return resOK({ ok: true });
  }

  @UseGuards(VerifiedAuthGuard)
  @Post(':rideId/arrived')
  async driverArrived(@Req() _req: any, @Body() body: { rideId: string; passengerId: string }) {
    const { rideId, passengerId } = body;
    await this.ridesService.driverArrived({ rideId, passengerId });
    return resOK({ ok: true });
  }

  // Driver taps Start Trip (pre-trip -> in-trip). Notify passenger via socket.
  @UseGuards(VerifiedAuthGuard)
  @Post(':rideId/start')
  async startTrip(@Req() _req: any, @Body() body: { rideId: string; passengerId: string }) {
    const { rideId, passengerId } = body;
    await this.ridesService.start({ rideId, passengerId });
    return resOK({ ok: true });
  }

  @UseGuards(VerifiedAuthGuard)
  @Post(':rideId/complete')
  async complete(@Req() _req: any, @Body() body: { rideId: string; passengerId: string }) {
    const { rideId, passengerId } = body;
    await this.ridesService.complete({ rideId, passengerId });
    return resOK({ ok: true });
  }

  @UseGuards(VerifiedAuthGuard)
  @Get('history')
  async history(@Req() req: any, @Query('role') role?: string) {
    const r = await this.ridesService.history({ userId: req.user._id, role: role === 'driver' ? 'driver' : 'passenger' });
    return resOK(r);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get(':rideId')
  async getById(@Req() _req: any, @Param('rideId') rideId: string) {
    const ride = await this.ridesService.getById(rideId);
    return resOK(ride);
  }

  @UseGuards(VerifiedAuthGuard)
  @Post(':rideId/cancel')
  async cancel(@Req() req: any, @Param('rideId') rideId: string) {
    const r = await this.ridesService.cancel({ rideId, userId: req.user._id });
    return resOK(r);
  }
}
