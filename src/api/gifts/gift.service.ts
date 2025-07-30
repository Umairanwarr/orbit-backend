/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {Injectable} from "@nestjs/common";
import {InjectModel} from "@nestjs/mongoose";
import {Model, FilterQuery, QueryOptions, UpdateQuery} from "mongoose";
import {BaseService} from "../../core/common/base.service";
import {IGift} from "./entities/gift.entity";

@Injectable()
export class GiftService extends BaseService<IGift> {
    constructor(
        @InjectModel("gift") private readonly model: Model<IGift>
    ) {
        super();
    }

    async create(dto: Partial<IGift>): Promise<IGift> {
        const created = await this.model.create(dto);
        return this.findById(created._id);
    }

    createMany(obj: Array<Partial<IGift>>, session?): Promise<any> {
        return Promise.resolve(this.model.create(obj, {session}));
    }

    deleteMany(filter: FilterQuery<IGift>): Promise<any> {
        return Promise.resolve(this.model.deleteMany(filter));
    }

    deleteOne(filter: FilterQuery<IGift>): Promise<any> {
        return Promise.resolve(this.model.deleteOne(filter));
    }

    findAll(
        filter?: FilterQuery<IGift> | undefined,
        select?: string | null | undefined,
        options?: QueryOptions<IGift> | null | undefined
    ) {
        return Promise.resolve(this.model.find(filter, select, options));
    }

    findById(
        id: string,
        select?: string | null | undefined
    ): Promise<IGift | null> {
        return Promise.resolve(this.model.findById(id, select));
    }

    async findByIdOrThrow(
        id: string,
        select?: string | null | undefined
    ): Promise<IGift> {
        const gift = await this.findById(id, select);
        if (!gift) {
            throw new Error(`Gift with id ${id} not found`);
        }
        return gift;
    }

    findByIdAndDelete(id: string): Promise<IGift | null> {
        return Promise.resolve(this.model.findByIdAndDelete(id));
    }

    findByIdAndUpdate(
        id: string,
        update: Partial<IGift>
    ): Promise<IGift | null> {
        return Promise.resolve(
            this.model.findByIdAndUpdate(id, update, { new: true })
        );
    }

    findOne(
        filter: FilterQuery<IGift>,
        select?: string | null | undefined
    ): Promise<IGift | null> {
        return Promise.resolve(this.model.findOne(filter, select));
    }

    findOneAndUpdate(
        filter: FilterQuery<IGift>,
        update: Partial<IGift>
    ): Promise<IGift | null> {
        return Promise.resolve(
            this.model.findOneAndUpdate(filter, update, { new: true })
        );
    }

    updateMany(filter: FilterQuery<IGift>, update: UpdateQuery<IGift>, session?, options?: QueryOptions<IGift> | null): Promise<any> {
        return Promise.resolve(this.model.updateMany(filter, update, options).session(session));
    }

    findCount(filter: FilterQuery<IGift>, session?): Promise<any> {
        return Promise.resolve(this.model.countDocuments(filter));
    }

    async aggregateV2(stages: any[], page: number, limit: number) {
        let myAggregate = this.model.aggregate(stages);
        // @ts-ignore
        return this.model.aggregatePaginate(myAggregate, {
            page,
            limit,
        });
    }
}
