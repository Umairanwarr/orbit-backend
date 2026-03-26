import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DriverPresenceSchema } from './driver_presence.entity';
import { DriverPresenceService } from './driver_presence.service';
import { DriverPresenceController } from './driver_presence.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'DriverPresence', schema: DriverPresenceSchema },
    ]),
    AuthModule,
  ],
  controllers: [DriverPresenceController],
  providers: [DriverPresenceService],
  exports: [DriverPresenceService],
})
export class DriverPresenceModule {}
