/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Module } from '@nestjs/common';
import { UserVersionService } from './user_version.service';
import { UserVersionController } from './user_version.controller';
import { VersionsModule } from "../../versions/versions.module";
import { UserDeviceModule } from "../user_device/user_device.module";
import { AuthClientModule } from "src/common/auth_client/auth_client.module";
import { UserModule } from "../user/user.module";

@Module({
  controllers: [UserVersionController],
  providers: [UserVersionService],
  exports: [UserVersionService],
  imports:[
    VersionsModule,
    AuthClientModule,
    UserModule,
    UserDeviceModule
  ]
})
export class UserVersionModule {}
