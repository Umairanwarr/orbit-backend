/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { IsNotEmpty, IsString } from "class-validator";
import CommonDto from "../../../core/common/dto/common.dto";

export class NotificationReplyDto extends CommonDto {
    @IsNotEmpty()
    @IsString()
    content: string;

    @IsNotEmpty()
    @IsString()
    roomId: string;

    @IsNotEmpty()
    @IsString()
    localId: string;

    @IsString()
    platform?: string = 'notification';
}
