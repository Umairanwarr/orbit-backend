/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LiveStreamController } from './live_stream.controller';
import { LiveStreamService } from './live_stream.service';
import { AgoraRecordingService } from './services/agora-recording.service';
import { LiveStreamSchema, LiveStreamParticipantSchema, LiveStreamMessageSchema, LiveStreamJoinRequestSchema, LiveStreamRecordingSchema } from './schemas/live_stream.schema';
import { RecordingPurchase, RecordingPurchaseSchema } from './schemas/recording_purchase.schema';
import { GiftPurchaseSchema } from './schemas/gift_purchase.schema';
import { SupportDonationSchema } from './schemas/support_donation.schema';
import { GiftSchema } from '../gifts/entities/gift.entity';
import { LiveCategorySchema } from './schemas/live_category.schema';
import { AgoraModule } from '../../chat/agora/agora.module';
import { SocketIoModule } from '../../chat/socket_io/socket_io.module';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user_modules/user/user.module';
import { NotificationEmitterModule } from '../../common/notification_emitter/notification_emitter.module';
import { UserDeviceModule } from '../user_modules/user_device/user_device.module';
import { PesapalModule } from '../payments/pesapal/pesapal.module';
import { LiveStreamPaymentsListener } from './live_stream_payments.listener';
import { RoomMemberModule } from '../../chat/room_member/room_member.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: 'LiveStream', schema: LiveStreamSchema },
            { name: 'LiveStreamParticipant', schema: LiveStreamParticipantSchema },
            { name: 'LiveStreamMessage', schema: LiveStreamMessageSchema },
            { name: 'LiveStreamJoinRequest', schema: LiveStreamJoinRequestSchema },
            { name: 'LiveStreamRecording', schema: LiveStreamRecordingSchema },
            { name: 'LiveCategory', schema: LiveCategorySchema },
            { name: RecordingPurchase.name, schema: RecordingPurchaseSchema },
            { name: 'gift', schema: GiftSchema },
            { name: 'GiftPurchase', schema: GiftPurchaseSchema },
            { name: 'SupportDonation', schema: SupportDonationSchema },
        ]),
        AgoraModule,
        SocketIoModule,
        AuthModule,
        UserModule,
        RoomMemberModule,
        NotificationEmitterModule,
        UserDeviceModule,
        PesapalModule,
    ],
    controllers: [LiveStreamController],
    providers: [LiveStreamService, AgoraRecordingService, LiveStreamPaymentsListener],
    exports: [LiveStreamService]
})
export class LiveStreamModule { }
