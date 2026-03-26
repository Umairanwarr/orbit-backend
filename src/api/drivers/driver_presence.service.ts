import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IDriverPresence } from './driver_presence.entity';

@Injectable()
export class DriverPresenceService {
  constructor(
    @InjectModel('DriverPresence') private readonly presenceModel: Model<IDriverPresence>,
  ) {}

  async upsertPresence(params: { userId: string; lat: number; lng: number; vehicleType?: string }) {
    const { userId, lat, lng, vehicleType } = params;
    const updatedAt = new Date();
    await this.presenceModel.updateOne(
      { userId },
      {
        $set: {
          userId,
          vehicleType: vehicleType || null,
          lat,
          lng,
          loc: { type: 'Point', coordinates: [lng, lat] },
          updatedAt,
        },
      },
      { upsert: true }
    );
    return { ok: true };
  }

  async removePresence(userId: string) {
    await this.presenceModel.deleteOne({ userId });
    return { ok: true };
  }

  private isBikeFamily(s: string) {
    const v = (s || '').toLowerCase();
    return v.includes('bike') || v.includes('motor');
  }

  private normalizeType(s?: string) {
    return (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  async findNearby(params: { lat: number; lng: number; radiusKm: number; family?: 'car' | 'bike'; vehicleTypeExact?: string }) {
    const { lat, lng, radiusKm, family, vehicleTypeExact } = params;
    const maxDistance = Math.max(0.1, radiusKm) * 1000; // meters
    const query: any = {
      loc: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: maxDistance,
        },
      },
    };
    const docs = await this.presenceModel.find(query).limit(200).lean();
    // Exact vehicle type takes precedence (normalized)
    if (vehicleTypeExact && vehicleTypeExact.trim().length > 0) {
      const want = this.normalizeType(vehicleTypeExact);
      return docs.filter((d) => this.normalizeType(d?.vehicleType) === want);
    }
    // Otherwise, optional broad family filter
    if (!family) return docs;
    return docs.filter((d) => {
      const isBike = this.isBikeFamily(d?.vehicleType ?? '');
      return family === 'bike' ? isBike : !isBike;
    });
  }
}
