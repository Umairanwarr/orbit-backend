/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {Document, Schema} from 'mongoose';
import pM from "mongoose-paginate-v2";

export interface IGift extends Document {
    name: string;
    description?: string;
    imageUrl: string;
    // Backward compatibility: existing records use 'price' (USD). New fields below.
    price: number;
    currency?: 'USD' | 'KES';
    priceUsd?: number;
    priceKes?: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export const GiftSchema: Schema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        imageUrl: {
            type: String,
            required: true,
        },
        price: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            enum: ['USD', 'KES'],
            default: 'USD',
        },
        priceUsd: {
            type: Number,
            min: 0,
            default: null,
        },
        priceKes: {
            type: Number,
            min: 0,
            default: null,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    },
);

GiftSchema.plugin(pM);
