import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TicketSchema, ITicket } from './ticket.entity';
import { UserSchema } from '../user_modules/user/entities/user.entity';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { AuthClientModule } from "src/common/auth_client/auth_client.module";
import { FileUploaderModule } from '../../common/file_uploader/file_uploader.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Ticket', schema: TicketSchema },
      { name: 'User', schema: UserSchema },
    ]),
    AuthClientModule,
    FileUploaderModule,
  ],
  providers: [TicketsService],
  controllers: [TicketsController],
})
export class TicketsModule {}
