/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Body, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { VerifiedAuthGuard } from '../../core/guards/verified.auth.guard';
import { V1Controller } from '../../core/common/v1-controller.decorator';
import { ScheduledMessageService } from './scheduled_message.service';
import { Allow, IsBooleanString, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import CommonDto from '../../core/common/dto/common.dto';
import { MessageType } from '../../core/utils/enums';
import { resOK } from '../../core/utils/res.helpers';

class ScheduleMessageDto extends CommonDto {
  @IsNotEmpty()
  @IsString()
  roomId!: string;

  @IsNotEmpty()
  @IsString()
  content!: string;

  // Prefer UUID, but accept any non-empty string to keep client simple
  @IsNotEmpty()
  @IsString()
  localId!: string;

  @IsNotEmpty()
  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsEnum(MessageType)
  messageType?: MessageType;

  @Allow()
  @ValidateIf((o) => o['attachment'])
  attachment?: any;

  @IsOptional()
  @IsBooleanString()
  isEncrypted?: string;

  @IsOptional()
  @IsBooleanString()
  isOneSeen?: string;

  @IsOptional()
  @IsString()
  platform?: string;
}

@UseGuards(VerifiedAuthGuard)
@V1Controller('scheduled-message')
export class ScheduledMessageController {
  constructor(private readonly service: ScheduledMessageService) {}

  @Post('')
  async create(@Body() body: ScheduleMessageDto, @Param() params: any, @Req() req: any) {
    // Nest injects req via guard; but to be consistent use body.myUser
    const dto = body as any;
    dto.myUser = (req as any)?.user ?? dto.myUser; // fallback
    const scheduled = await this.service.schedule({
      roomId: dto.roomId,
      myUser: dto.myUser,
      content: dto.content,
      localId: dto.localId,
      scheduledAt: new Date(dto.scheduledAt),
      isEncrypted: dto.isEncrypted === 'true',
      isOneSeen: dto.isOneSeen === 'true',
      messageType: dto.messageType,
      attachment: dto.attachment,
      platform: dto.platform,
    });
    return resOK(scheduled);
  }

  @Get('room/:roomId')
  async listMyRoom(@Param('roomId') roomId: string, @Req() req: any) {
    const items = await this.service.list(req.user._id, roomId, 50);
    return resOK(items);
  }

  @Delete(':id')
  async cancelOne(@Param('id') id: string, @Req() req: any) {
    const item = await this.service.cancel(req.user._id, id);
    return resOK(item);
  }
}
