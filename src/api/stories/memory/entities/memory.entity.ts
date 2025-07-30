/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */
import {Schema, Document} from "mongoose";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";

export interface IMemory extends Document {
    userId: string;
    storyId: string;
    originalStoryData: object; // Store the complete story data
    savedAt: Date;
    reminderDate?: Date; // For anniversary reminders
    isReminderEnabled: boolean;
    tags?: string[]; // Optional tags for categorization
    createdAt: Date;
    updatedAt: Date;
}

export const MemorySchema: Schema = new Schema(
    {
        userId: {type: Schema.Types.ObjectId, required: true, ref: 'user', index: 1},
        storyId: {type: Schema.Types.ObjectId, required: true, ref: 'story', index: 1},
        originalStoryData: {type: Object, required: true}, // Store complete story data
        savedAt: {type: Date, default: Date.now, index: 1},
        reminderDate: {type: Date, index: 1}, // For anniversary notifications
        isReminderEnabled: {type: Boolean, default: true},
        tags: {type: [String], default: []},
        createdAt: {type: Date},
        updatedAt: {type: Date}
    },
    {
        timestamps: true,
    },
);

MemorySchema.plugin(aggregatePaginate);
MemorySchema.index({userId: 1, savedAt: -1}); // For efficient user memory queries
MemorySchema.index({userId: 1, reminderDate: 1}); // For reminder queries
