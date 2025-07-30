/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {BadRequestException, Injectable, NotFoundException} from "@nestjs/common";
import {FilterQuery, PaginateModel, PaginateOptions, QueryOptions, UpdateQuery} from "mongoose";
import mongoose from "mongoose";
import {InjectModel} from "@nestjs/mongoose";
import {PaginationParameters} from "mongoose-paginate-v2";
import {IUser} from "./entities/user.entity";
import {UserDeviceService} from "../user_device/user_device.service";
import {isValidMongoId} from "../../../core/utils/utils";
import {BaseService} from "../../../core/common/base.service";
import {remove} from "remove-accents";
import {i18nApi} from "../../../core/utils/res.helpers";
import {RegisterStatus} from "../../../core/utils/enums";

@Injectable()
export class UserService extends BaseService<IUser> {
    constructor(
        @InjectModel("user") private readonly model: PaginateModel<IUser>,
        private readonly userDevice: UserDeviceService
    ) {
        super();

    }

    createMany(obj: Partial<IUser>[], session?: any): Promise<any> {
        return Promise.resolve(this.model.create(obj, {session}));
    }

    aggregate(obj: any[], session?: any): Promise<any> {
        return Promise.resolve(this.model.aggregate(obj, {session}));
    }

    async findOneByEmail(email: string, select?: string) {
        return this.model.findOne({email: email}).select(select).lean();
    }

    async findOneByEmailOrThrow(email: string, select: string) {
        let usr = await this.model.findOne({email: email}).select(select).lean();
        if (!usr)
            throw new NotFoundException(i18nApi.userEmailNotFound);
        return usr;
    }


    async setLastSeenAt(_id: string) {
        await this.model.findByIdAndUpdate(_id, {
            lastSeenAt: new Date()
        });
    }


    async findByIds(usersIds: string[], select?: string) {
        return this.model.find({_id: {$in: usersIds}}, select).lean();
    }


    findById(id: string, select?: string, options?: {}): Promise<IUser | null> {
        // Skip validation for balance-related queries
        if (select === 'balance' || select === 'claimedGifts' || (select && select.includes('balance'))) {
            console.log('UserService: Bypassing validation for balance query, id:', id);
            return Promise.resolve(this.model.findById(id, select, options).lean());
        }

        if (!isValidMongoId(id)) {
            throw new BadRequestException("NOT VALID MONGO DB OBJECT " + id);
        }
        return Promise.resolve(this.model.findById(id, select, options).lean());
    }

    // Special method for balance operations that bypasses validation
    findByIdForBalance(id: string, select?: string): Promise<IUser | null> {
        console.log('UserService: findByIdForBalance called with id:', id, 'type:', typeof id);
        return Promise.resolve(this.model.findById(id, select).lean());
    }

    // Special method for authentication that bypasses validation
    findByIdForAuth(id: string, select?: string): Promise<IUser | null> {
        console.log('UserService: findByIdForAuth called with id:', id, 'type:', typeof id);
        try {
            // Convert string to ObjectId for MongoDB query
            const objectId = new mongoose.Types.ObjectId(id);
            return Promise.resolve(this.model.findById(objectId, select).lean());
        } catch (error) {
            console.error('UserService: findByIdForAuth error:', error);
            return Promise.resolve(null);
        }
    }

    findByIdAndDelete(id: string) {
        if (!isValidMongoId(id)) {
            throw new BadRequestException("NOT VALID MONGO DB OBJECT " + id);
        }
        return Promise.resolve(this.model.findByIdAndRemove(id).lean());
    }

    async findByIdOrThrow(id: string, select?: string, options?: {}): Promise<IUser> {
        if (!isValidMongoId(id)) {
            throw new BadRequestException(" NOT VALID MONGO DB OBJECT " + id);
        }
        let user = await this.model.findById(id, select,).lean();
        if (!user) throw new NotFoundException("User with id " + id + " Not exist in db");
        return user;
    }

    async findByIdAndUpdate(_id: string, update: {}, session?) {
        return this.model.findByIdAndUpdate(_id, update, {session});
    }

    async create(obj: Partial<IUser>, session?) {
        let cs = await this.model.create([obj], {session});
        return cs[0];
    }


    async searchV2(dto: Object, notContains: any[]) {
        let filter: object = {
            _id: {
                $nin: notContains
            },
            deletedAt: {
                $eq: null
            },
            registerStatus: {
                $eq: RegisterStatus.accepted
            },
            "userPrivacy.publicSearch": {
                $eq: true
            }
        };
        let paginationParameters = new PaginationParameters({
                query: {
                    limit: 30,
                    sort: "-_id",
                    ...filter,
                    ...dto
                }
            }
        ).get();
        if (paginationParameters[1].page <= 0) {
            paginationParameters[1].page = 1;
        }
        if (paginationParameters[1].limit <= 0 || paginationParameters[1].limit >= 50) {
            paginationParameters[1].limit = 30;
        }
        paginationParameters[1].select = "fullName fullNameEn userImage bio phoneNumber createdAt isPrime roles hasBadge";
        let fullName = dto["fullName"];
        if (fullName) {
            filter = {
                ...filter,
                fullNameEn: {
                    "$regex": ".*" + remove(fullName) + ".*",
                    "$options": "i"
                }
            };
        }
        paginationParameters[0] = filter;
        return this.model.paginate(...paginationParameters);
    }

    deleteMany(filter: FilterQuery<IUser>): Promise<any> {
        return Promise.resolve(undefined);
    }

    updateMany(filter: FilterQuery<IUser>, update: UpdateQuery<IUser>, options?: QueryOptions<IUser> | null | undefined): Promise<any> {
        return Promise.resolve(this.model.updateMany(filter, update, options));
    }

    findAll(filter?: FilterQuery<IUser>, select?: string, options?: QueryOptions<IUser> | null | undefined): Promise<any> {
        return Promise.resolve(this.model.find(filter, select, options));
    }

    findOne(filter: FilterQuery<IUser>, select: string): Promise<IUser | null> {

        return Promise.resolve(this.model.findOne(filter, select));
    }

    findOneAndUpdate(filter: FilterQuery<IUser>, update: UpdateQuery<IUser>, session?, options?: QueryOptions<IUser> | null | undefined): Promise<IUser | null> {
        return Promise.resolve(this.model.findOneAndUpdate(filter, update, options).session(session));
    }

    async paginateModel(filter: FilterQuery<IUser>, options?: PaginateOptions) {
        return this.model.paginate(filter, options);
    }

    async fullPaginateModel(p) {
        return this.model.paginate(...p);
    }

    async findCount(filter?: FilterQuery<IUser>) {
        return this.model.countDocuments(filter);
    }

    private async _addIsPrime() {
        await this.model.updateMany({}, {
            isPrime: false,
            hasBadge: false,
            roles: []
        })
    }

    // Balance management methods
    async addToBalance(userId: string, amount: number): Promise<IUser | null> {
        console.log('UserService: addToBalance called with userId:', userId, 'amount:', amount);
        const objectId = new mongoose.Types.ObjectId(userId);
        return this.model.findOneAndUpdate(
            { _id: objectId },
            { $inc: { balance: amount } },
            { new: true }
        ).lean();
    }

    async subtractFromBalance(userId: string, amount: number): Promise<IUser | null> {
        console.log('UserService: subtractFromBalance called with userId:', userId, 'amount:', amount);
        const objectId = new mongoose.Types.ObjectId(userId);
        // Only subtract if user has enough balance
        const user = await this.model.findOne({ _id: objectId }, 'balance').lean();
        if (!user || user.balance < amount) {
            throw new BadRequestException('Insufficient balance');
        }

        return this.model.findOneAndUpdate(
            { _id: objectId },
            { $inc: { balance: -amount } },
            { new: true }
        ).lean();
    }

    async setBalance(userId: string, amount: number): Promise<IUser | null> {
        console.log('UserService: setBalance called with userId:', userId, 'amount:', amount);
        const objectId = new mongoose.Types.ObjectId(userId);
        return this.model.findOneAndUpdate(
            { _id: objectId },
            { balance: amount },
            { new: true }
        ).lean();
    }

    // Claimed gifts management methods
    async addClaimedGift(userId: string, giftMessageId: string): Promise<IUser | null> {
        console.log('UserService: addClaimedGift called with userId:', userId, 'giftMessageId:', giftMessageId);
        const objectId = new mongoose.Types.ObjectId(userId);
        return this.model.findOneAndUpdate(
            { _id: objectId },
            { $addToSet: { claimedGifts: giftMessageId } },
            { new: true }
        ).lean();
    }

    async isGiftClaimed(userId: string, giftMessageId: string): Promise<boolean> {
        console.log('UserService: isGiftClaimed called with userId:', userId, 'giftMessageId:', giftMessageId);
        const objectId = new mongoose.Types.ObjectId(userId);
        const user = await this.model.findOne({ _id: objectId }, 'claimedGifts').lean();
        return user ? user.claimedGifts.includes(giftMessageId) : false;
    }

    async removeClaimedGift(userId: string, giftMessageId: string): Promise<IUser | null> {
        console.log('UserService: removeClaimedGift called with userId:', userId, 'giftMessageId:', giftMessageId);
        const objectId = new mongoose.Types.ObjectId(userId);
        return this.model.findOneAndUpdate(
            { _id: objectId },
            { $pull: { claimedGifts: giftMessageId } },
            { new: true }
        ).lean();
    }

    async getUserBalance(userId: string): Promise<number> {
        console.log('UserService: getUserBalance called with userId:', userId, 'type:', typeof userId);
        try {
            // Now use regular findById since validation is bypassed for balance queries
            const user = await this.findById(userId, 'balance');
            console.log('UserService: getUserBalance found user:', user);
            return user ? user.balance || 0 : 0;
        } catch (error) {
            console.error('UserService: getUserBalance error:', error);
            throw error;
        }
    }

    // Direct method that completely bypasses all validation and error handling
    async getUserBalanceDirect(userId: string): Promise<number> {
        console.log('UserService: getUserBalanceDirect called with userId:', userId, 'type:', typeof userId);
        try {
            // Check if userId is valid before converting
            if (!userId || typeof userId !== 'string') {
                console.error('UserService: Invalid userId provided:', userId);
                return 0;
            }

            // Convert string to ObjectId for MongoDB query
            console.log('UserService: Converting userId to ObjectId...');
            const objectId = new mongoose.Types.ObjectId(userId);
            console.log('UserService: ObjectId created successfully:', objectId);

            const user = await this.model.findOne({ _id: objectId }).select('balance').lean().exec();
            console.log('UserService: getUserBalanceDirect found user:', user);
            return user && user.balance !== undefined ? user.balance : 0;
        } catch (error) {
            console.error('UserService: getUserBalanceDirect error:', error);
            console.error('UserService: Error stack:', error.stack);
            // Return 0 on any error
            return 0;
        }
    }
}
