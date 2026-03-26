import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IRide, RideStatus } from './ride.entity';
import { IDriverApplication } from '../drivers/driver_application.entity';
import { SocketIoService } from '../../chat/socket_io/socket_io.service';
import { DriverPresenceService } from '../drivers/driver_presence.service';

function toAbsoluteMediaUrl(url?: string, req?: any): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
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

@Injectable()
export class RidesService implements OnModuleInit {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  constructor(
    @InjectModel('Ride') private readonly rideModel: Model<IRide>,
    @InjectModel('driver_applications') private readonly driverAppModel: Model<IDriverApplication>,
    @InjectModel('users') private readonly userModel: Model<any>,
    @InjectModel('scheduled_rides') private readonly scheduledModel: Model<any>,
    private readonly presence: DriverPresenceService,
    private readonly socketIo: SocketIoService,
  ) {}

  onModuleInit() {
    try {
      setInterval(() => {
        this._dispatchScheduledSafely().catch(() => {});
      }, 10_000);
      // Rehydrate timers for future scheduled rides (next 24h)
      this._rehydrateTimersFromDb().catch(() => {});
    } catch {}
  }

  private async _dispatchScheduledSafely() {
    const now = new Date();
    const dueItems = await this.scheduledModel
      .find({ status: 'scheduled', scheduledAt: { $lte: now } })
      .sort({ scheduledAt: 1 })
      .limit(20)
      .lean();
    try { console.log('[Sched] loop tick, dueItems=', dueItems.length, 'at', now.toISOString()); } catch {}
    for (const item of dueItems) {
      try { console.log('[Sched] processing', item?._id?.toString?.(), 'scheduledAt=', item?.scheduledAt); } catch {}
      const locked = await this.scheduledModel.findOneAndUpdate(
        { _id: item._id, status: 'scheduled' },
        { $set: { status: 'dispatched', dispatchedAt: new Date(), lastAttemptAt: new Date() } },
        { new: true },
      );
      if (!locked) continue;
      const passenger: any = await this.userModel.findById(item.passengerId).lean();
      let drivers = await this.presence.findNearby({
        lat: item.pickupLat,
        lng: item.pickupLng,
        radiusKm: 5,
        vehicleTypeExact: item.rideType,
        family: item.rideType ? undefined : (undefined as any),
      });
      try { console.log('[Sched] round1 drivers=', drivers?.length || 0); } catch {}
      let dispatched = 0;
      const payload = {
        id: `sched_${locked._id.toString()}`,
        passengerId: item.passengerId.toString(),
        passengerName: passenger?.fullName ?? 'Passenger',
        passengerPhotoUrl: toAbsoluteMediaUrl(passenger?.userImage, undefined),
        pickupAddress: item.pickupAddress,
        dropoffAddress: item.dropoffAddress,
        pickupLat: item.pickupLat,
        pickupLng: item.pickupLng,
        dropoffLat: item.dropoffLat,
        dropoffLng: item.dropoffLng,
        fareKes: item.fareKes,
        rideType: item.rideType,
        paymentMethod: (item.paymentMethod || 'cash').toLowerCase(),
        passengersCount: typeof item.passengersCount === 'number' && item.passengersCount > 0 ? Math.floor(item.passengersCount) : 1,
        createdAt: new Date().toISOString(),
        isScheduled: true,
        scheduledAt: item.scheduledAt,
      } as any;
      if (!drivers?.length) {
        const wideDrivers = await this.presence.findNearby({
          lat: item.pickupLat,
          lng: item.pickupLng,
          radiusKm: 50,
          vehicleTypeExact: item.rideType,
          family: item.rideType ? undefined : (undefined as any),
        });
        drivers = wideDrivers || [];
        try { console.log('[Sched] round2 drivers=', drivers?.length || 0); } catch {}
      } else {
        // keep drivers as is
      }
      // Round 3: if still none, broadcast to all online drivers (ignore type)
      if (!drivers?.length) {
        const all = await this.presence.findNearby({
          lat: item.pickupLat,
          lng: item.pickupLng,
          radiusKm: 20000,
          vehicleTypeExact: undefined,
          family: undefined as any,
        });
        try { console.log('[Sched] round3 drivers(all)=', all?.length || 0); } catch {}
        for (const d of all || []) {
          try {
            this.socketIo.io.to(d.userId.toString()).emit('ride_request', payload);
            dispatched++;
          } catch {}
        }
        // Final fallback: global broadcast so at least one driver receives during testing
        if (dispatched === 0) {
          try {
            this.socketIo.io.emit('ride_request', payload);
            dispatched = -1; // mark as broadcast
            console.log('[Sched] global broadcast used for', locked._id.toString());
          } catch {}
        }
      } else {
        for (const d of drivers) {
          try {
            this.socketIo.io.to(d.userId.toString()).emit('ride_request', payload);
            dispatched++;
          } catch {}
        }
      }
      try { console.log('[Sched] dispatchedCount=', dispatched, 'for', locked._id.toString()); } catch {}
      await this.scheduledModel.updateOne({ _id: locked._id }, { $set: { dispatchedCount: dispatched } });
    }
  }

  async accept(params: {
    req: any;
    driverId: string;
    body: {
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
    };
  }) {
    const { req, driverId, body } = params;
    const driverIdStr = (driverId as any)?.toString ? (driverId as any).toString() : String(driverId);
    // Fetch driver vehicle details from latest approved application
    const latestApp = (await this.driverAppModel
      .findOne({ userId: driverIdStr, status: 'approved' })
      .sort({ createdAt: -1 })
      .lean()) as IDriverApplication | null;
    try {
      // Debug logs for diagnosis
      // eslint-disable-next-line no-console
      console.log('[RidesService.accept] driverId=', driverIdStr, 'latestApp:', latestApp);
    } catch {}

    const ride = await this.rideModel.create({
      passengerId: body.passengerId,
      driverId: driverId,
      passengersCount: typeof body.passengersCount === 'number' && body.passengersCount > 0 ? Math.floor(body.passengersCount) : 1,
      pickupAddress: body.pickupAddress,
      dropoffAddress: body.dropoffAddress,
      pickupLat: body.pickupLat,
      pickupLng: body.pickupLng,
      dropoffLat: body.dropoffLat,
      dropoffLng: body.dropoffLng,
      fareKes: body.fareKes,
      rideType: body.rideType,
      status: 'assigned' as RideStatus,
      vehicleType: latestApp?.vehicleType,
      vehicleModel: latestApp?.vehicleModel,
      vehiclePlate: latestApp?.vehiclePlate,
    } as any);

    // If accepting a scheduled request, mark the scheduled record as booked to prevent re-dispatch
    try {
      const rid = (body.requestId || '').toString();
      if (rid.startsWith('sched_')) {
        const schedId = rid.substring('sched_'.length);
        await this.scheduledModel.updateOne(
          { _id: schedId },
          { $set: { status: 'booked', driverId: driverIdStr, rideId: ride._id.toString(), lastAttemptAt: new Date() } },
        );
      }
    } catch {}

    const driverPayload = {
      rideId: ride._id.toString(),
      driverId: driverId,
      driverName: req.user.fullName,
      driverPhotoUrl: toAbsoluteMediaUrl(req.user.userImage, req),
      vehicleType: ride.vehicleType,
      vehicleModel: ride.vehicleModel,
      vehiclePlate: ride.vehiclePlate,
      fareKes: ride.fareKes,
      pickupAddress: ride.pickupAddress,
      dropoffAddress: ride.dropoffAddress,
      pickupLat: ride.pickupLat,
      pickupLng: ride.pickupLng,
      dropoffLat: ride.dropoffLat,
      dropoffLng: ride.dropoffLng,
      status: ride.status,
      rideType: ride.rideType,
      passengersCount: ride.passengersCount,
      createdAt: ride.createdAt,
      preTrip: (() => { try { const rid = (body.requestId || '').toString(); return rid.startsWith('sched_'); } catch { return false; } })(),
    };

    // Notify passenger that a driver was assigned
    const preTrip = (body.requestId || '').toString().startsWith('sched_');
    this.socketIo.io.to(body.passengerId.toString()).emit('ride_assigned', { ...driverPayload, preTrip });

    return ride;
}

async start(params: { rideId: string; passengerId: string }) {
  const { rideId, passengerId } = params;
  await this.rideModel.updateOne({ _id: rideId }, { $set: { status: 'started' as RideStatus } });
  // Notify both parties that trip started
  try { this.socketIo.io.to(passengerId.toString()).emit('ride_started', { rideId, ts: Date.now() }); } catch {}
  try { this.socketIo.io.to((await this.rideModel.findById(rideId).lean() as any)?.driverId?.toString?.() ?? '').emit('ride_started', { rideId, ts: Date.now() }); } catch {}
  return { ok: true };
}

async sendDriverLocation(params: { rideId: string; passengerId: string; lat: number; lng: number }) {
  const { rideId, passengerId, lat, lng } = params;
  this.socketIo.io.to(passengerId.toString()).emit('ride_driver_location', {
    rideId,
    lat,
    lng,
    ts: Date.now(),
  });
  return { ok: true };
}

  async driverArrived(params: { rideId: string; passengerId: string }) {
    const { rideId, passengerId } = params;
    await this.rideModel.updateOne({ _id: rideId }, { $set: { status: 'driver_arrived' as RideStatus } });
    this.socketIo.io.to(passengerId.toString()).emit('ride_driver_arrived', { rideId, ts: Date.now() });
    return { ok: true };
  }

  async complete(params: { rideId: string; passengerId: string }) {
    const { rideId, passengerId } = params;
    await this.rideModel.updateOne({ _id: rideId }, { $set: { status: 'completed' as RideStatus } });
    this.socketIo.io.to(passengerId.toString()).emit('ride_completed', { rideId, ts: Date.now() });
    return { ok: true };
  }

  async getById(rideId: string) {
    const ride = await this.rideModel.findById(rideId).lean();
    if (!ride) return null;
    return ride;
  }

  async cancel(params: { rideId: string; userId: string }) {
    const { rideId, userId } = params;
    const ride = await this.rideModel.findById(rideId).lean();
    if (!ride) return { ok: false };
    const driverId = (ride as any).driverId?.toString?.() ?? null;
    const passengerId = (ride as any).passengerId?.toString?.() ?? null;
    const canceledBy = driverId && driverId === (userId as any).toString?.() ? 'driver' : 'passenger';
    await this.rideModel.updateOne({ _id: rideId }, { $set: { status: 'canceled' as RideStatus } });
    const payload = { rideId, canceledBy, ts: Date.now() } as any;
    if (passengerId) this.socketIo.io.to(passengerId.toString()).emit('ride_canceled', payload);
    if (driverId) this.socketIo.io.to(driverId.toString()).emit('ride_canceled', payload);
    return { ok: true, canceledBy };
  }

  async history(params: { userId: string; role?: 'driver' | 'passenger' }) {
    const { userId, role } = params;
    const match: any = { status: { $in: ['completed', 'canceled'] } };
    if (role === 'driver') match.driverId = userId;
    else match.passengerId = userId;
    const rides = (await this.rideModel.find(match).sort({ createdAt: -1 }).lean()) as any[];
    if (!rides.length) return [];
    const uids = new Set<string>();
    for (const r of rides) {
      if (r.driverId) uids.add(r.driverId.toString());
      if (r.passengerId) uids.add(r.passengerId.toString());
    }
    const users = (await this.userModel
      .find({ _id: { $in: Array.from(uids) } }, 'fullName userImage')
      .lean()) as any[];
    const umap = new Map<string, any>();
    for (const u of users) umap.set(u._id.toString(), u);
    return rides.map((r) => {
      const d = umap.get(r.driverId?.toString?.());
      const p = umap.get(r.passengerId?.toString?.());
      return {
        id: r._id?.toString?.(),
        status: r.status,
        fareKes: r.fareKes,
        passengersCount: r.passengersCount ?? 1,
        pickupAddress: r.pickupAddress,
        dropoffAddress: r.dropoffAddress,
        createdAt: r.createdAt,
        driver: d
          ? { id: r.driverId?.toString?.(), fullName: d.fullName, userImage: d.userImage }
          : { id: r.driverId?.toString?.() }
        ,
        passenger: p
          ? { id: r.passengerId?.toString?.(), fullName: p.fullName, userImage: p.userImage }
          : { id: r.passengerId?.toString?.() }
        ,
      };
    });
  }

  async schedule(params: {
    userId: string;
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
      scheduledAt: string;
      passengersCount?: number;
    };
  }) {
    const { userId, body } = params;
    const when = new Date(body.scheduledAt);
    if (isNaN(when.getTime())) throw new Error('Invalid scheduledAt');
    const min = new Date(Date.now() + 5 * 60 * 1000);
    if (when < min) throw new Error('scheduledAt must be at least 5 minutes in the future');
    const doc = await this.scheduledModel.create({
      passengerId: userId,
      passengersCount: typeof body.passengersCount === 'number' && body.passengersCount > 0 ? Math.floor(body.passengersCount) : 1,
      pickupAddress: body.pickupAddress,
      dropoffAddress: body.dropoffAddress,
      pickupLat: body.pickupLat,
      pickupLng: body.pickupLng,
      dropoffLat: body.dropoffLat,
      dropoffLng: body.dropoffLng,
      fareKes: body.fareKes,
      rideType: body.rideType,
      paymentMethod: (body.paymentMethod || 'cash').toLowerCase(),
      scheduledAt: when,
      status: 'scheduled',
    });
    try { console.log('[SchedCreate] id=', doc._id.toString(), 'scheduledAt=', when.toISOString()); } catch {}
    // Arm precise in-memory timer for near-term dispatch (redundant to the loop)
    this._scheduleTimer(doc._id.toString(), when).catch(() => {});

    // Immediately announce to nearby drivers so they can accept in advance
    try {
      const passenger: any = await this.userModel.findById(userId).lean();
      let drivers = await this.presence.findNearby({
        lat: body.pickupLat,
        lng: body.pickupLng,
        radiusKm: 5,
        vehicleTypeExact: body.rideType,
        family: body.rideType ? undefined : (undefined as any),
      });
      const payload = {
        id: `sched_${doc._id.toString()}`,
        passengerId: userId.toString(),
        passengerName: passenger?.fullName ?? 'Passenger',
        passengerPhotoUrl: toAbsoluteMediaUrl(passenger?.userImage, undefined),
        pickupAddress: body.pickupAddress,
        dropoffAddress: body.dropoffAddress,
        pickupLat: body.pickupLat,
        pickupLng: body.pickupLng,
        dropoffLat: body.dropoffLat,
        dropoffLng: body.dropoffLng,
        fareKes: body.fareKes,
        rideType: body.rideType,
        paymentMethod: (body.paymentMethod || 'cash').toLowerCase(),
        passengersCount: typeof body.passengersCount === 'number' && body.passengersCount > 0 ? Math.floor(body.passengersCount) : 1,
        createdAt: new Date().toISOString(),
        isScheduled: true,
        scheduledAt: when,
      } as any;
      if (!drivers?.length) {
        const wide = await this.presence.findNearby({
          lat: body.pickupLat,
          lng: body.pickupLng,
          radiusKm: 50,
          vehicleTypeExact: body.rideType,
          family: body.rideType ? undefined : (undefined as any),
        });
        drivers = wide || [];
      }
      if (!drivers?.length) {
        const all = await this.presence.findNearby({
          lat: body.pickupLat,
          lng: body.pickupLng,
          radiusKm: 20000,
          vehicleTypeExact: undefined,
          family: undefined as any,
        });
        for (const d of all || []) {
          try { this.socketIo.io.to(d.userId.toString()).emit('ride_request', payload); } catch {}
        }
        // Do not mark status yet; allow timer to re-announce at scheduled time if still unaccepted
      } else {
        for (const d of drivers) {
          try { this.socketIo.io.to(d.userId.toString()).emit('ride_request', payload); } catch {}
        }
      }
    } catch {}
    return { id: doc._id.toString() };
  }

  async myScheduledRides(params: { userId: string }) {
    const items = await this.scheduledModel
      .find({ passengerId: params.userId, status: { $in: ['scheduled', 'dispatched'] } })
      .sort({ scheduledAt: 1 })
      .lean();
    return items.map((r: any) => ({
      id: r._id.toString(),
      pickupAddress: r.pickupAddress,
      dropoffAddress: r.dropoffAddress,
      pickupLat: r.pickupLat,
      pickupLng: r.pickupLng,
      dropoffLat: r.dropoffLat,
      dropoffLng: r.dropoffLng,
      fareKes: r.fareKes,
      rideType: r.rideType,
      paymentMethod: r.paymentMethod,
      passengersCount: r.passengersCount ?? 1,
      scheduledAt: r.scheduledAt,
      status: r.status,
      dispatchedCount: r.dispatchedCount ?? 0,
    }));
  }

  async cancelScheduled(params: { userId: string; id: string }) {
    const r: any = await this.scheduledModel.findOne({ _id: params.id }).lean();
    if (!r) return { ok: false };
    if (r.passengerId.toString() !== (params.userId as any).toString()) return { ok: false };
    await this.scheduledModel.updateOne({ _id: params.id }, { $set: { status: 'canceled' } });
    return { ok: true };
  }

  async rescheduleScheduled(params: { userId: string; id: string; scheduledAt: string }) {
    const r: any = await this.scheduledModel.findOne({ _id: params.id }).lean();
    if (!r) throw new Error('Not found');
    if (r.passengerId.toString() !== (params.userId as any).toString()) throw new Error('Forbidden');
    const when = new Date(params.scheduledAt);
    if (isNaN(when.getTime())) throw new Error('Invalid scheduledAt');
    const min = new Date(Date.now() + 5 * 60 * 1000);
    if (when < min) throw new Error('scheduledAt must be at least 5 minutes in the future');
    await this.scheduledModel.updateOne(
      { _id: params.id },
      { $set: { scheduledAt: when, status: 'scheduled', dispatchedAt: null, dispatchedCount: 0, lastAttemptAt: null } },
    );
    // Re-arm timer
    try {
      const t = this.timers.get(params.id);
      if (t) {
        clearTimeout(t);
        this.timers.delete(params.id);
      }
    } catch {}
    this._scheduleTimer(params.id, when).catch(() => {});
    return { ok: true };
  }

  private async _scheduleTimer(id: string, when: Date) {
    const delay = Math.max(0, when.getTime() - Date.now());
    // If far in the future, still set a timer; background loop will act as safety
    const t = setTimeout(() => {
      this._dispatchScheduledById(id).catch(() => {});
      // one-shot
      this.timers.delete(id);
    }, delay);
    this.timers.set(id, t);
  }

  private async _dispatchScheduledById(id: string) {
    const item: any = await this.scheduledModel.findOne({ _id: id, status: 'scheduled' }).lean();
    if (!item) return;
    try { console.log('[SchedTimer] firing for', id, 'scheduledAt=', item.scheduledAt); } catch {}
    // lock
    const locked: any = await this.scheduledModel.findOneAndUpdate(
      { _id: (item as any)._id, status: 'scheduled' },
      { $set: { status: 'dispatched', dispatchedAt: new Date(), lastAttemptAt: new Date() } },
      { new: true },
    );
    if (!locked) return;
    const passenger: any = await this.userModel.findById(item.passengerId).lean();
    // Reuse same 3-round broadcast logic as in loop
    let drivers = await this.presence.findNearby({
      lat: item.pickupLat,
      lng: item.pickupLng,
      radiusKm: 5,
      vehicleTypeExact: item.rideType,
      family: item.rideType ? undefined : (undefined as any),
    });
    try { console.log('[SchedTimer] round1 drivers=', drivers?.length || 0); } catch {}
    let dispatched = 0;
    const payload = {
      id: `sched_${locked._id.toString()}`,
      passengerId: item.passengerId.toString(),
      passengerName: passenger?.fullName ?? 'Passenger',
      passengerPhotoUrl: toAbsoluteMediaUrl(passenger?.userImage, undefined),
      pickupAddress: item.pickupAddress,
      dropoffAddress: item.dropoffAddress,
      pickupLat: item.pickupLat,
      pickupLng: item.pickupLng,
      dropoffLat: item.dropoffLat,
      dropoffLng: item.dropoffLng,
      fareKes: item.fareKes,
      rideType: item.rideType,
      paymentMethod: (item.paymentMethod || 'cash').toLowerCase(),
      passengersCount: typeof item.passengersCount === 'number' && item.passengersCount > 0 ? Math.floor(item.passengersCount) : 1,
      createdAt: new Date().toISOString(),
      isScheduled: true,
      scheduledAt: item.scheduledAt,
    } as any;
    if (!drivers?.length) {
      const wideDrivers = await this.presence.findNearby({
        lat: item.pickupLat,
        lng: item.pickupLng,
        radiusKm: 50,
        vehicleTypeExact: item.rideType,
        family: item.rideType ? undefined : (undefined as any),
      });
      drivers = wideDrivers || [];
    }
    if (!drivers?.length) {
      const all = await this.presence.findNearby({
        lat: item.pickupLat,
        lng: item.pickupLng,
        radiusKm: 20000,
        vehicleTypeExact: undefined,
        family: undefined as any,
      });
      try { console.log('[SchedTimer] round3 all drivers=', all?.length || 0); } catch {}
      for (const d of all || []) {
        try {
          this.socketIo.io.to(d.userId.toString()).emit('ride_request', payload);
          dispatched++;
        } catch {}
      }
      if (dispatched === 0) {
        try {
          this.socketIo.io.emit('ride_request', payload);
          dispatched = -1;
          console.log('[SchedTimer] global broadcast used for', locked._id.toString());
        } catch {}
      }
    } else {
      for (const d of drivers) {
        try {
          this.socketIo.io.to(d.userId.toString()).emit('ride_request', payload);
          dispatched++;
        } catch {}
      }
    }
    try { console.log('[SchedTimer] dispatchedCount=', dispatched, 'for', locked._id.toString()); } catch {}
    await this.scheduledModel.updateOne({ _id: locked._id }, { $set: { dispatchedCount: dispatched } });
  }

  private async _rehydrateTimersFromDb() {
    const now = new Date();
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const items: any[] = await this.scheduledModel
      .find({ status: 'scheduled', scheduledAt: { $gt: now, $lte: horizon } })
      .limit(500)
      .lean();
    try { console.log('[SchedBoot] rehydrate timers count=', items.length); } catch {}
    for (const it of items) {
      try {
        const when = new Date(it.scheduledAt);
        this._scheduleTimer(it._id.toString(), when).catch(() => {});
      } catch {}
    }
  }

  // Dev: list my scheduled items with timer armed status
  async debugScheduled(params: { userId: string }) {
    const list: any[] = await this.scheduledModel
      .find({ passengerId: params.userId, status: { $in: ['scheduled', 'dispatched'] } })
      .sort({ scheduledAt: 1 })
      .lean();
    return list.map((r) => ({
      id: r._id.toString(),
      scheduledAt: r.scheduledAt,
      status: r.status,
      dispatchedCount: r.dispatchedCount ?? 0,
      timerArmed: this.timers.has(r._id.toString()),
      now: new Date().toISOString(),
    }));
  }

  // Dev: force dispatch a scheduled item now (if owned by user)
  async forceDispatchScheduled(params: { userId: string; id: string }) {
    const r: any = await this.scheduledModel.findOne({ _id: params.id }).lean();
    if (!r) return { ok: false, reason: 'not_found' };
    if (r.passengerId.toString() !== (params.userId as any).toString()) return { ok: false, reason: 'forbidden' };
    await this._dispatchScheduledById(params.id);
    return { ok: true };
  }
}
