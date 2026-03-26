/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {Document, Schema} from "mongoose";
import pM from "mongoose-paginate-v2";
import { BaseUser } from "../../../core/utils/interfaceces";
import { MessageType, Platform } from "../../../core/utils/enums";

export interface IMessage extends Document {
    //senderId
    sId: string,
    mentions: string[],
    //senderName
    sName: string,
    //senderImageThumb
    sImg: string,
    //platform (os)
    plm: string,
    //room id
    rId: string;
    //message content
    c: string;
    //message type
    mT: MessageType,
    //message attachment
    msgAtt?: object,
    //attached link info
    linkAtt?: object,
    //replied to message
    rTo?: IMessage,
    //seen at
    sAt?: Date,
    //delivered at
    dAt?: Date,
    ///deleted from all at
    dltAt?: Date,
    //parent broadcast message id
    pBId: string,
    //who star
    stars: string[],
    isEncrypted: boolean,
    //deleted from (only me)
    dF: string[],
    oneSeenBy: string[],
    //local Id
    lId: string,
    //forward from message id
    forId?: string,
    createdAt: string,
    isOneSeen: boolean,
    peerData: BaseUser,
    //is message edited
    isEdited: boolean,
    //message reactions
    reactions?: object,
    //pinned state
    isPinned?: boolean,
    pinnedAt?: Date,
    pinnedBy?: string,
}

export const MessageSchema: Schema = new Schema({
    //senderId
    sId: {type: Schema.Types.ObjectId, required: true},

    //senderName
    sName: {type: String, required: true},
    //senderImageThumb
    sImg: {type: String, required: false, default: '/v-public/default_user_image.png'},
    //platform
    plm: {
        type: String,
        enum: Object.values(Platform),
        required: true
    },
    //roomId
    rId: {type: Schema.Types.ObjectId, required: true, index: 1},
    //content
    c: {type: String, required: true},
    isEncrypted: {type: Boolean, default: false},
    //messageType
    mT: {
        type: String,
        enum: Object.values(MessageType),
        required: true
    },
    //messageAttachment
    msgAtt: {
        type: Object,
        default: null
    },
    //reply to
    rTo: {
        type: Object,
        default: null
    },
    isOneSeen: {type: Boolean, default: false},
    oneSeenBy: {
        type: [Schema.Types.ObjectId],
        default: [],
    },
    mentions: {type: [Schema.Types.ObjectId], default: []},
    //seenAt
    sAt: {
        type: Date,
        default: null
    },

    //deliveredAt
    dAt: {
        type: Date,
        default: null
    },
    //forwardLocalId
    forId: {
        type: String,
        default: null
    },
    //deletedAt
    dltAt: {
        type: Date,
        default: null
    },
    //ParentBroadcastMessageId
    pBId: {type: Schema.Types.ObjectId, default: null},
    //deletedFrom
    dF: {type: [Schema.Types.ObjectId], select: false, default: []},
    stars: {type: [Schema.Types.ObjectId], default: []},

    //local Id
    lId: {type: String, required: true, unique: true},
    linkAtt: {
        type: Object,
        default: null
    },
    peerData: {type: Object, default: null},
    //is message edited
    isEdited: {type: Boolean, default: false},
    //message reactions
    reactions: {type: Object, default: null},
    //pinned state
    isPinned: {type: Boolean, default: false},
    pinnedAt: {type: Date, default: null},
    pinnedBy: {type: Schema.Types.ObjectId, default: null, ref: "user"},
}, {
    timestamps: true,

});
// Transform to ensure message media URLs are always relative paths
MessageSchema.set('toJSON', {
    transform: function(doc, ret) {
        if (ret.attachment) {
            try {
                const att = typeof ret.attachment === 'string' ? JSON.parse(ret.attachment) : ret.attachment;
                if (att.url && att.url.startsWith('http')) {
                    const url = new URL(att.url);
                    att.url = url.pathname;
                    ret.attachment = typeof ret.attachment === 'string' ? JSON.stringify(att) : att;
                    console.log(`Message toJSON transform - Converted attachment URL to: ${att.url}`);
                }
            } catch (e) {
                // Ignore parsing errors
            }
        }
        return ret;
    }
});

MessageSchema.set('toObject', {
    transform: function(doc, ret) {
        if (ret.attachment) {
            try {
                const att = typeof ret.attachment === 'string' ? JSON.parse(ret.attachment) : ret.attachment;
                if (att.url && att.url.startsWith('http')) {
                    const url = new URL(att.url);
                    att.url = url.pathname;
                    ret.attachment = typeof ret.attachment === 'string' ? JSON.stringify(att) : att;
                    console.log(`Message toObject transform - Converted attachment URL to: ${att.url}`);
                }
            } catch (e) {
                // Ignore parsing errors
            }
        }
        return ret;
    }
});

MessageSchema.plugin(pM)


MessageSchema.index({stars: 1})
MessageSchema.index({mentions: 1})
MessageSchema.index({dF: 1})
MessageSchema.index({sId: 1})
MessageSchema.index({uId: 1})
MessageSchema.index({rId: 1, isPinned: 1})