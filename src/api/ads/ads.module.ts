/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdsService } from './ads.service';
import { AdSchema } from './entities/ad.entity';
import { UserModule } from '../user_modules/user/user.module';

@Module({
  providers: [AdsService],
  exports: [AdsService],
  imports: [
    MongooseModule.forFeature([{ name: 'Ad', schema: AdSchema }]),
    UserModule,
  ],
})
export class AdsModule {}
