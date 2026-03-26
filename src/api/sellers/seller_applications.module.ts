import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SellerApplicationSchema } from './seller_application.entity';
import { SellerApplicationsService } from './seller_applications.service';
import { SellerApplicationsController } from './seller_applications.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'seller_applications', schema: SellerApplicationSchema },
    ]),
    AuthModule,
  ],
  controllers: [SellerApplicationsController],
  providers: [SellerApplicationsService],
  exports: [SellerApplicationsService],
})
export class SellerApplicationsModule {}
