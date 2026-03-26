import { Module } from '@nestjs/common';
import { RidesController } from './rides.controller';
import { DriverPresenceModule } from '../drivers/driver_presence.module';
import { SocketIoModule } from '../../chat/socket_io/socket_io.module';
import { AuthModule } from '../auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { RideSchema } from './ride.entity';
import { RatingSchema } from './rating.entity';
import { DriverApplicationSchema } from '../drivers/driver_application.entity';
import { UserSchema } from '../user_modules/user/entities/user.entity';
import { RidesService } from './rides.service';
import { ScheduledRideSchema } from './scheduled_ride.entity';
import { RatingsController } from './ratings.controller';

@Module({
  imports: [
    DriverPresenceModule,
    SocketIoModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: 'Ride', schema: RideSchema },
      // Use the same model token/collection name as DriverApplicationsModule
      { name: 'driver_applications', schema: DriverApplicationSchema },
      { name: 'users', schema: UserSchema },
      { name: 'scheduled_rides', schema: ScheduledRideSchema },
      { name: 'Rating', schema: RatingSchema },
    ]),
  ],
  controllers: [RidesController, RatingsController],
  providers: [RidesService],
  exports: [RidesService],
})
export class RidesModule {}
