import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WithdrawRequestSchema } from './withdraw_request.entity';
import { WithdrawRequestsService } from './withdraw_requests.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'withdraw_requests', schema: WithdrawRequestSchema },
    ]),
  ],
  providers: [WithdrawRequestsService],
  exports: [WithdrawRequestsService],
})
export class WithdrawRequestsModule {}
