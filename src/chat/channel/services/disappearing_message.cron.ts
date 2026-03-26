/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SingleRoomSettingsService } from '../../single_room_settings/single_room_settings.service';
import { MessageService } from '../../message/message.service';
import { SocketIoService } from '../../socket_io/socket_io.service';
import { SocketEventsType, MessageType } from '../../../core/utils/enums';
import { FileUploaderService } from '../../../common/file_uploader/file_uploader.service';

@Injectable()
export class DisappearingMessageCronService {
  private readonly logger = new Logger('DisappearingMessageCron');

  constructor(
    private readonly singleRoom: SingleRoomSettingsService,
    private readonly messageService: MessageService,
    private readonly socket: SocketIoService,
    private readonly uploader: FileUploaderService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processExpired() {
    try {
      const settings = await this.singleRoom.findAll({ dmExpSec: { $ne: null } });
      const now = Date.now();
      for (const s of settings as any[]) {
        const expSec: number = s.dmExpSec;
        if (!expSec || expSec <= 0) continue;
        const cutoff = new Date(now - expSec * 1000);
        const sinceAt: Date | null = s.dmSinceAt || null;
        if (!sinceAt) {
          // do not delete anything until the timer is explicitly turned on
          continue;
        }
        const filter: any = {
          rId: s._id,
          dltAt: null,
          mT: { $ne: MessageType.Info },
          createdAt: { $lte: cutoff },
        };
        filter.createdAt.$gte = sinceAt;
        const msgs = await this.messageService.findWhere(filter);
        if (!msgs || msgs.length === 0) continue;

        for (const m of msgs as any[]) {
          try {
            const msgAtt: any = m?.msgAtt;
            const url = msgAtt?.url;
            const thumbUrl = msgAtt?.thumbUrl;
            const thumbImageUrl = msgAtt?.thumbImage?.url;
            if (typeof url === 'string' && url) {
              await this.uploader.deleteByUrl(url);
            }
            if (typeof thumbUrl === 'string' && thumbUrl) {
              await this.uploader.deleteByUrl(thumbUrl);
            }
            if (typeof thumbImageUrl === 'string' && thumbImageUrl) {
              await this.uploader.deleteByUrl(thumbImageUrl);
            }
          } catch (_) {}
        }

        const ids = msgs.map((m: any) => m._id);
        const nowDate = new Date();
        await this.messageService.updateMany({ _id: { $in: ids } }, { dltAt: nowDate });
        // emit delete events
        for (const m of msgs) {
          try {
            // reflect new deletion time in emitted payload
            const payload = { ...(m.toObject ? m.toObject() : m), dltAt: nowDate, dm: true, delReason: 'disappearing' };
            this.socket.io
              .to(s._id.toString())
              .emit(
                SocketEventsType.v1OnDeleteMessageFromAll,
                JSON.stringify(payload)
              );
          } catch (_) {}
        }
      }
    } catch (e) {
      this.logger.error(`processExpired failed: ${e?.message || e}`);
    }
  }
}
