/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */
import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Delete,
    UseGuards,
    Req,
    Query,
    BadRequestException,
    NotFoundException,
    ConflictException
} from '@nestjs/common';
import { MemoryService } from './memory.service';
import { VerifiedAuthGuard } from "../../../core/guards/verified.auth.guard";
import { V1Controller } from "../../../core/common/v1-controller.decorator";
import { resOK } from "../../../core/utils/res.helpers";
import { CreateMemoryDto, GetMemoriesDto, UpdateMemoryDto } from "./dto/memory.dto";
import { MongoIdDto } from "../../../core/common/dto/mongo.id.dto";
import { StoryService } from "../story/story.service";

@UseGuards(VerifiedAuthGuard)
@V1Controller('memories')
export class MemoryController {
    constructor(
        private readonly memoryService: MemoryService,
        private readonly storyService: StoryService,
    ) {}

    @Post()
    async create(@Body() dto: CreateMemoryDto, @Req() req: any) {
        dto.myUser = req.user;

        // Check if story exists
        const story = await this.storyService.findById(dto.storyId);
        if (!story) {
            throw new NotFoundException('Story not found');
        }

        // Check if memory already exists for this story
        const existingMemory = await this.memoryService.findByUserIdAndStoryId(
            req.user._id,
            dto.storyId
        );
        if (existingMemory) {
            throw new ConflictException('Story already saved to memories');
        }

        // Create memory with original story data
        const memoryData = {
            ...dto.toJson(),
            originalStoryData: story,
        };

        const memory = await this.memoryService.create(memoryData);
        return resOK(memory);
    }

    @Get()
    async findAll(@Req() req: any, @Query() dto: GetMemoriesDto) {
        dto.myUser = req.user;
        const memories = await this.memoryService.findByUserId(
            req.user._id,
            dto.pageNumber,
            dto.limitNumber
        );
        return resOK(memories);
    }

    @Get(':id')
    async findOne(@Param() params: MongoIdDto, @Req() req: any) {
        const memory = await this.memoryService.findById(params.id);
        if (!memory) {
            throw new NotFoundException('Memory not found');
        }

        // Check if memory belongs to user
        if (memory.userId.toString() !== req.user._id.toString()) {
            throw new BadRequestException('Access denied');
        }

        return resOK(memory);
    }

    @Delete(':id')
    async remove(@Param() params: MongoIdDto, @Req() req: any) {
        const memory = await this.memoryService.findById(params.id);
        if (!memory) {
            throw new NotFoundException('Memory not found');
        }

        // Check if memory belongs to user
        if (memory.userId.toString() !== req.user._id.toString()) {
            throw new BadRequestException('Access denied');
        }

        const deleted = await this.memoryService.deleteById(params.id);
        return resOK({ deleted });
    }

    @Delete('story/:storyId')
    async removeByStoryId(@Param('storyId') storyId: string, @Req() req: any) {
        const deleted = await this.memoryService.deleteByUserIdAndStoryId(
            req.user._id,
            storyId
        );
        return resOK({ deleted });
    }

    @Get('reminders/today')
    async getTodayReminders(@Req() req: any) {
        const today = new Date();
        const memories = await this.memoryService.getMemoriesForReminder(today);
        
        // Filter memories for current user
        const userMemories = memories.filter(
            memory => memory.userId.toString() === req.user._id.toString()
        );
        
        return resOK(userMemories);
    }
}
