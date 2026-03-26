/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaginateModel } from 'mongoose';
import { IScheduledMessage } from './entities/scheduled.message.entity';
import { MessageChannelService } from '../channel/services/message.channel.service';
import { SendMessageDto } from '../channel/dto/send.message.dto';
import { MessageType } from '../../core/utils/enums';

@Injectable()
export class ScheduledMessageService {
  private readonly logger = new Logger('ScheduledMessageService');

  constructor(
    @InjectModel('scheduled_message') private readonly model: PaginateModel<IScheduledMessage>,
    private readonly messageChannel: MessageChannelService,
  ) {}

  async schedule(params: {
    roomId: string;
    myUser: any;
    content: string;
    localId: string;
    scheduledAt: Date;
    isEncrypted?: boolean;
    isOneSeen?: boolean;
    messageType?: MessageType;
    attachment?: any;
    platform?: string;
  }) {
    // Ensure platform matches the Platform enum used by schemas
    const platformMap: Record<string, string> = {
      android: 'android',
      ios: 'ios',
      web: 'web',
      linux: 'linux',
      macos: 'macOs', // normalize casing
      macosx: 'macOs',
      mac: 'macOs',
      windows: 'windows',
      other: 'other',
    };
    const key = (params.platform || '').toString().toLowerCase();
    const plm = platformMap[key] ?? 'other';
    const doc = await this.model.create({
      sId: params.myUser._id,
      sName: params.myUser.fullName,
      sImg: params.myUser.userImage,
      plm,
      rId: params.roomId,
      c: params.content,
      mT: params.messageType ?? MessageType.Text,
      msgAtt: params.attachment ?? null,
      lId: params.localId,
      isEncrypted: !!params.isEncrypted,
      isOneSeen: !!params.isOneSeen,
      scheduledAt: params.scheduledAt,
      status: 'pending',
    });
    return doc.toObject();
  }

  async cancel(myUserId: string, id: string) {
    const updated = await this.model.findOneAndUpdate(
      { _id: id, sId: myUserId, status: 'pending' },
      { status: 'canceled', updatedAt: new Date() },
      { new: true },
    );
    return updated?.toObject();
  }

  async list(myUserId: string, roomId: string, limit = 50) {
    const docs = await this.model
      .find({ sId: myUserId, rId: roomId, status: { $in: ['pending', 'sending'] } })
      .sort({ scheduledAt: 1 })
      .limit(Math.max(1, Math.min(limit, 100)))
      .lean();
    return docs;
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async dispatchDue() {
    const now = new Date();
    // pick a small batch of pending items
    const dueItems = await this.model
      .find({ status: 'pending', scheduledAt: { $lte: now } })
      .sort({ scheduledAt: 1 })
      .limit(20)
      .lean();

    for (const item of dueItems) {
      // attempt to lock the item by switching to 'sending'
      const locked = await this.model.findOneAndUpdate(
        { _id: item._id, status: 'pending' },
        { status: 'sending', updatedAt: new Date() },
        { new: true },
      );
      if (!locked) continue; // already handled elsewhere

      try {
        const dto = new SendMessageDto();
        dto.content = item.c;
        dto.localId = item.lId;
        dto.messageType = item.mT as any;
        dto.myUser = { _id: item.sId, fullName: item.sName, userImage: item.sImg } as any;
        dto._roomId = (item.rId as any).toString();
        dto._platform = item.plm;
        if (item.mT === MessageType.Custom && item.msgAtt) {
          dto.attachment = JSON.stringify(item.msgAtt);
        }
        dto.isEncrypted = item.isEncrypted ? 'true' : 'false';
        dto.isOneSeen = item.isOneSeen;

        const sent = await this.messageChannel.createMessage(dto, false);
        await this.model.findByIdAndUpdate(item._id, {
          status: 'sent',
          sentMessageId: sent._id,
          updatedAt: new Date(),
        });
      } catch (e: any) {
        this.logger.error(`Failed to send scheduled message ${item._id}: ${e?.message || e}`);
        await this.model.findByIdAndUpdate(item._id, {
          status: 'failed',
          error: e?.message || 'unknown',
          updatedAt: new Date(),
        });
      }
    }
  }
}
