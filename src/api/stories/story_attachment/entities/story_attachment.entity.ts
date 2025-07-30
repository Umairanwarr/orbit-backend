import mongoose, {Schema} from "mongoose";
import pM from "mongoose-paginate-v2";

export interface IStoryReply {
    userId: string;
    text: string;
    createdAt: Date;
}

export interface IStoryAttachment {
    _id: string
    storyId: string;
    shares: any[];
    reply: IStoryReply[];
    likes: any[];

}

export const StoryAttachment = new mongoose.Schema(
    {
        storyId: {type: Schema.Types.ObjectId, required: true, ref: "story"},
        shares: {type: [Schema.Types.ObjectId],  default: []},
        reply: {
            type: [
                {
                    userId: { type: Schema.Types.ObjectId, ref: 'user', required: true },
                    text: { type: String, required: true },
                    createdAt: { type: Date, default: Date.now }
                }
            ],
            default: []
        },
        likes: {type: [Schema.Types.ObjectId],  default: []},
    },
    {
        timestamps: true
    }
);
StoryAttachment.plugin(pM)


