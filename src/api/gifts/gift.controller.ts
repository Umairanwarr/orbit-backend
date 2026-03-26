/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {Get, Query} from "@nestjs/common";
import {GiftService} from "./gift.service";
import {V1Controller} from "../../core/common/v1-controller.decorator";
import {resOK} from "../../core/utils/res.helpers";
import { ConfigService } from "@nestjs/config";

@V1Controller("gifts")
export class GiftController {
    constructor(private readonly giftService: GiftService, private readonly config: ConfigService) {}

    @Get("/")
    async getActiveGifts(@Query() filter: Object) {
        // Only return active gifts for public API
        const activeFilter = { ...filter, isActive: true };
        const gifts = await this.giftService.findAll(activeFilter, null, {
            sort: { createdAt: -1 }
        });

        const rate = Number(process.env.USD_TO_KES_RATE || this.config.get<string>('USD_TO_KES_RATE') || 160);
        const formattedGifts = gifts.map((gift: any) => {
            const priceUsd = gift.priceUsd ?? (gift.currency === 'USD' ? gift.price : null);
            const priceKes = gift.priceKes ?? (gift.currency === 'USD' ? Math.round((priceUsd ?? gift.price) * rate) : gift.price);
            return {
                id: gift._id.toString(),
                name: gift.name,
                description: gift.description,
                imageUrl: gift.imageUrl,
                price: priceKes, // keep backward compat: 'price' is now KES for clients
                currency: 'KES',
                priceKes: priceKes,
                priceUsd: priceUsd ?? null,
                isActive: gift.isActive,
                createdAt: gift.createdAt,
                updatedAt: gift.updatedAt
            };
        });

        return resOK(formattedGifts);
    }
}
