/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IUser } from '../../../api/user_modules/user/entities/user.entity';

@Injectable()
export class AddBalanceAndClaimedGiftsMigration {
    constructor(
        @InjectModel('user') private readonly userModel: Model<IUser>
    ) {}

    async run(): Promise<void> {
        console.log('Starting migration: Add balance and claimedGifts fields to users');
        
        try {
            // Update all users that don't have the balance field
            const result = await this.userModel.updateMany(
                { 
                    $or: [
                        { balance: { $exists: false } },
                        { claimedGifts: { $exists: false } }
                    ]
                },
                { 
                    $set: { 
                        balance: 0,
                        claimedGifts: []
                    }
                }
            );

            console.log(`Migration completed: Updated ${result.modifiedCount} users`);
        } catch (error) {
            console.error('Migration failed:', error);
            throw error;
        }
    }
}
