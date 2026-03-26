/**
 * Driver Applications Module
 */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DriverApplicationSchema } from './driver_application.entity';
import { DriverApplicationsService } from './driver_applications.service';
import { DriverApplicationsController } from './driver_applications.controller';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user_modules/user/user.module';
import { AppConfigModule } from '../app_config/app_config.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'driver_applications', schema: DriverApplicationSchema },
    ]),
    AuthModule,
    UserModule,
    AppConfigModule,
  ],
  controllers: [DriverApplicationsController],
  providers: [DriverApplicationsService],
  exports: [DriverApplicationsService],
})
export class DriverApplicationsModule {}
