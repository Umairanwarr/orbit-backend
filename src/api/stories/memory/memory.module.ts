/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */
import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryController } from './memory.controller';
import { MongooseModule } from "@nestjs/mongoose";
import { MemorySchema } from "./entities/memory.entity";
import { StoryModule } from "../story/story.module";
import { AuthModule } from "../../auth/auth.module";

@Module({
  controllers: [MemoryController],
  providers: [MemoryService],
  exports: [MemoryService],
  imports: [
    MongooseModule.forFeature([{
      name: "memory",
      schema: MemorySchema
    }]),
    StoryModule,
    AuthModule,
  ]
})
export class MemoryModule {}
