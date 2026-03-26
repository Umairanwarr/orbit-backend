/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {Document, Schema} from "mongoose";

export interface ISingleRoomSettings extends Document {
    _id: string
    //creator id
    cId: string
    //peerId
    pId: string
    // disappearing messages expiry in seconds (null/off when not set)
    dmExpSec?: number | null
    // when the disappearing timer was last enabled/changed
    dmSinceAt?: Date | null
    // advanced chat privacy: when true, participants can't auto-download media
    acp?: boolean
    createdAt: Date,
    updatedAt: Date,
}

export const SingleRoomSettings: Schema = new Schema({
    cId: {type: Schema.Types.ObjectId, required: true, ref: "user",index:1},
    pId: {type: Schema.Types.ObjectId, required: true, ref: "user",index:1},
    dmExpSec: {type: Number, default: null},
    dmSinceAt: {type: Date, default: null},
    acp: {type: Boolean, default: false},
    updatedAt: {type: Date, select: false}
}, {
    timestamps: true,
     

});
SingleRoomSettings.index({cId: 1, pId: 1}, {unique: true})
