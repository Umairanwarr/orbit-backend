/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {
    Controller,
    Get,
    Req,
    UseGuards
} from '@nestjs/common';
import { LoyaltyPointsService } from './loyalty_points.service';
import { VerifiedAuthGuard } from '../../../core/guards/verified.auth.guard';
import { V1Controller } from '../../../core/common/v1-controller.decorator';
import { resOK } from '../../../core/utils/res.helpers';

@UseGuards(VerifiedAuthGuard)
@V1Controller('loyalty-points')
export class LoyaltyPointsController {
    constructor(private readonly loyaltyPointsService: LoyaltyPointsService) {}

    @Get('/')
    async getUserLoyaltyPoints(@Req() req: any) {
        const points = await this.loyaltyPointsService.getUserPoints(req.user._id);
        return resOK({
            loyaltyPoints: points,
            userId: req.user._id
        });
    }
}
