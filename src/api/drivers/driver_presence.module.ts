import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DriverPresenceSchema } from './driver_presence.entity';
import { DriverPresenceService } from './driver_presence.service';
import { DriverPresenceController } from './driver_presence.controller';
import { AuthClientModule } from "src/common/auth_client/auth_client.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'DriverPresence', schema: DriverPresenceSchema },
    ]),
    AuthClientModule,
  ],
  controllers: [DriverPresenceController],
  providers: [DriverPresenceService],
  exports: [DriverPresenceService],
})
export class DriverPresenceModule {}
