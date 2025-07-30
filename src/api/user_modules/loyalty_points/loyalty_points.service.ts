/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Injectable } from '@nestjs/common';
import { UserService } from '../user/user.service';

export enum LoyaltyPointsAction {
    SIGNUP = 'SIGNUP',
    JOIN_GROUP = 'JOIN_GROUP'
}

export interface LoyaltyPointsConfig {
    [LoyaltyPointsAction.SIGNUP]: number;
    [LoyaltyPointsAction.JOIN_GROUP]: number;
}

@Injectable()
export class LoyaltyPointsService {
    private readonly pointsConfig: LoyaltyPointsConfig = {
        [LoyaltyPointsAction.SIGNUP]: 10,
        [LoyaltyPointsAction.JOIN_GROUP]: 5
    };

    constructor(
        private readonly userService: UserService
    ) {}

    async addPoints(userId: string, action: LoyaltyPointsAction): Promise<number> {
        const pointsToAdd = this.pointsConfig[action];
        
        const user = await this.userService.findById(userId, 'loyaltyPoints');
        if (!user) {
            throw new Error('User not found');
        }

        const newPoints = (user.loyaltyPoints || 0) + pointsToAdd;
        
        await this.userService.findByIdAndUpdate(userId, {
            loyaltyPoints: newPoints
        });

        return newPoints;
    }

    async getUserPoints(userId: string): Promise<number> {
        const user = await this.userService.findById(userId, 'loyaltyPoints');
        if (!user) {
            throw new Error('User not found');
        }
        
        return user.loyaltyPoints || 0;
    }

    async setUserPoints(userId: string, points: number): Promise<number> {
        await this.userService.findByIdAndUpdate(userId, {
            loyaltyPoints: points
        });
        
        return points;
    }

    getPointsForAction(action: LoyaltyPointsAction): number {
        return this.pointsConfig[action];
    }
}
