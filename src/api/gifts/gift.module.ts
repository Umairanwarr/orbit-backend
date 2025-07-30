/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {Module} from "@nestjs/common";
import {MongooseModule} from "@nestjs/mongoose";
import {GiftSchema} from "./entities/gift.entity";
import {GiftService} from "./gift.service";
import {GiftController} from "./gift.controller";

@Module({
    imports: [
        MongooseModule.forFeature([
            {
                name: "gift",
                schema: GiftSchema,
            },
        ]),
    ],
    controllers: [GiftController],
    providers: [GiftService],
    exports: [GiftService],
})
export class GiftModule {}
