/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduledMessageSchema } from './entities/scheduled.message.entity';
import { ScheduledMessageService } from './scheduled_message.service';
import { ChannelModule } from '../channel/channel.module';
import { ScheduledMessageController } from './scheduled_message.controller';
import { AuthModule } from '../../api/auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'scheduled_message', schema: ScheduledMessageSchema },
    ]),
    ChannelModule,
    AuthModule,
  ],
  controllers: [ScheduledMessageController],
  exports: [
    MongooseModule,
    ScheduledMessageService,
  ],
  providers: [ScheduledMessageService],
})
export class ScheduledMessageModule {}
