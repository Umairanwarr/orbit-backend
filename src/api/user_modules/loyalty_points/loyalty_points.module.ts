/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Module, forwardRef } from '@nestjs/common';
import { LoyaltyPointsService } from './loyalty_points.service';
import { LoyaltyPointsController } from './loyalty_points.controller';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../../auth/auth.module';

@Module({
  controllers: [LoyaltyPointsController],
  providers: [LoyaltyPointsService],
  imports: [UserModule, forwardRef(() => AuthModule)],
  exports: [LoyaltyPointsService]
})
export class LoyaltyPointsModule {}
