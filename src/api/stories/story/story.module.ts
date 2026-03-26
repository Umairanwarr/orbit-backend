/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */
import { Module } from '@nestjs/common';
import { StoryService } from './story.service';
import {MongooseModule} from "@nestjs/mongoose";
import {StorySchema} from "./entities/story.entity";
import { StoryPublicController } from './story_public.controller';
import { UserModule } from '../../user_modules/user/user.module';

@Module({
  providers: [StoryService],
  exports: [StoryService],
  controllers: [StoryPublicController],
  imports:[
    MongooseModule.forFeature([{
      name: "story",
      schema: StorySchema
    }]),
    UserModule,
  ]
})
export class StoryModule {}
