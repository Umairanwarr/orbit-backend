import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SellerApplicationSchema } from './seller_application.entity';
import { SellerApplicationsService } from './seller_applications.service';
import { SellerApplicationsController } from './seller_applications.controller';
import { AuthClientModule } from "src/common/auth_client/auth_client.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'seller_applications', schema: SellerApplicationSchema },
    ]),
    AuthClientModule,
  ],
  controllers: [SellerApplicationsController],
  providers: [SellerApplicationsService],
  exports: [SellerApplicationsService],
})
export class SellerApplicationsModule {}
