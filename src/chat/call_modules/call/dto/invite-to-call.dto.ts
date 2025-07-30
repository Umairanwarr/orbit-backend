/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { IsArray, IsNotEmpty, IsString } from 'class-validator';
import { IUser } from '../../../../api/user_modules/user/entities/user.entity';

export class InviteToCallDto {
  callId?: string; // Optional, will be set from URL parameter

  @IsArray()
  @IsString({ each: true })
  roomIds: string[];

  myUser: IUser;
}
