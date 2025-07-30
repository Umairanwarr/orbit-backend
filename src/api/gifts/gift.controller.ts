/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {Get, Query} from "@nestjs/common";
import {GiftService} from "./gift.service";
import {V1Controller} from "../../core/common/v1-controller.decorator";
import {resOK} from "../../core/utils/res.helpers";

@V1Controller("gifts")
export class GiftController {
    constructor(private readonly giftService: GiftService) {
    }

    @Get("/")
    async getActiveGifts(@Query() filter: Object) {
        // Only return active gifts for public API
        const activeFilter = { ...filter, isActive: true };
        const gifts = await this.giftService.findAll(activeFilter, null, {
            sort: { createdAt: -1 }
        });

        const formattedGifts = gifts.map(gift => ({
            id: gift._id.toString(),
            name: gift.name,
            description: gift.description,
            imageUrl: gift.imageUrl,
            price: gift.price,
            isActive: gift.isActive,
            createdAt: gift.createdAt,
            updatedAt: gift.updatedAt
        }));

        return resOK(formattedGifts);
    }
}
