/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IMemory } from './entities/memory.entity';

@Injectable()
export class MemoryService {
    constructor(
        @InjectModel('memory') private readonly memoryModel: Model<IMemory>,
    ) {}

    async create(memoryData: Partial<IMemory>): Promise<IMemory> {
        console.log('Creating memory with data:', {
            userId: memoryData.userId,
            storyId: memoryData.storyId,
            savedAt: memoryData.savedAt
        });

        const memory = new this.memoryModel(memoryData);
        const savedMemory = await memory.save();

        console.log('Memory created successfully:', savedMemory._id);
        return savedMemory;
    }

    async findAll(conditions: any = {}): Promise<IMemory[]> {
        return await this.memoryModel.find(conditions).sort({ savedAt: -1 });
    }

    async findById(id: string): Promise<IMemory | null> {
        return await this.memoryModel.findById(id);
    }

    async findByUserId(userId: string, page: number = 1, limit: number = 20): Promise<any> {
        console.log('Finding memories for user:', userId, 'page:', page, 'limit:', limit);

        const options = {
            page,
            limit,
            sort: { savedAt: -1 },
        };

        const aggregateQuery = this.memoryModel.aggregate([
            { $match: { userId: new Types.ObjectId(userId) } },
            { $sort: { savedAt: -1 } }
        ]);

        // @ts-ignore
        const result = await this.memoryModel.aggregatePaginate(aggregateQuery, options);
        console.log('Memory query result:', {
            totalDocs: result.totalDocs,
            docsCount: result.docs?.length || 0,
            page: result.page,
            totalPages: result.totalPages
        });

        return result;
    }

    async findByUserIdAndStoryId(userId: string, storyId: string): Promise<IMemory | null> {
        return await this.memoryModel.findOne({
            userId: new Types.ObjectId(userId),
            storyId: new Types.ObjectId(storyId)
        });
    }

    async deleteById(id: string): Promise<boolean> {
        const result = await this.memoryModel.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    async deleteByUserIdAndStoryId(userId: string, storyId: string): Promise<boolean> {
        const result = await this.memoryModel.deleteOne({
            userId: new Types.ObjectId(userId),
            storyId: new Types.ObjectId(storyId)
        });
        return result.deletedCount > 0;
    }

    async getMemoriesForReminder(date: Date): Promise<IMemory[]> {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        return await this.memoryModel.find({
            isReminderEnabled: true,
            reminderDate: {
                $gte: startOfDay,
                $lte: endOfDay
            }
        });
    }

    async updateReminderSettings(id: string, isReminderEnabled: boolean): Promise<IMemory | null> {
        return await this.memoryModel.findByIdAndUpdate(
            id,
            { isReminderEnabled },
            { new: true }
        );
    }
}
