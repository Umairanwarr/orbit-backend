import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserService } from '../user_modules/user/user.service';
import { UserRole } from '../../core/utils/enums';

@Injectable()
export class VerificationExpiryCron {
  private readonly logger = new Logger('VerificationExpiryCron');

  constructor(private readonly userService: UserService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async unverifyExpired() {
    try {
      const now = new Date();
      const res = await this.userService.updateMany(
        {
          verifiedUntil: { $ne: null, $lte: now },
          roles: { $in: [UserRole.HasBadge] },
        } as any,
        {
          $set: { verifiedAt: null, verifiedUntil: null },
          $pull: { roles: UserRole.HasBadge },
        } as any,
      );

      const n = (res as any)?.modifiedCount ?? (res as any)?.nModified ?? 0;
      if (n > 0) {
        this.logger.log(`Unverified ${n} expired users`);
      }
    } catch (e: any) {
      this.logger.error(`unverifyExpired failed: ${e?.message || e}`);
    }
  }
}
