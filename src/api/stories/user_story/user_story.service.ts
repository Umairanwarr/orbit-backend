/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */
import {BadRequestException, ForbiddenException, Injectable} from '@nestjs/common';
import {StoryService} from "../story/story.service";
import {CreateStoryDto} from "./dto/story.dto";
import {resOK} from "../../../core/utils/res.helpers";
import {MongoIdDto} from "../../../core/common/dto/mongo.id.dto";
import {CreateS3UploaderDto} from "../../../common/file_uploader/create-s3_uploader.dto";
import {FileUploaderService} from "../../../common/file_uploader/file_uploader.service";
import {jsonDecoder} from "../../../core/utils/app.validator";
import {newMongoObjId} from "../../../core/utils/utils";
import {BanService} from "../../ban/ban.service";
import {UserBanService} from "../../user_modules/user_ban/user_ban.service";
import {PaginationParameters} from "mongoose-paginate-v2";
import {UserService} from "../../user_modules/user/user.service";
import {StoryPrivacy, UserPrivacyTypes, MessageType} from "../../../core/utils/enums";
import {IUser} from "../../user_modules/user/entities/user.entity";
import {StoryAttachmentService} from "../story_attachment/story_attachment.service";
import {ChannelService} from "../../../chat/channel/services/channel.service";
import {MessageChannelService} from "../../../chat/channel/services/message.channel.service";
import {SendMessageDto} from "../../../chat/channel/dto/send.message.dto";
import {MongoPeerIdDto} from "../../../core/common/dto/mongo.peer.id.dto";
import {v4 as uuidv4} from 'uuid';
import {MemoryService} from "../memory/memory.service";
import {SocketIoService} from "../../../chat/socket_io/socket_io.service";
import {SocketEventsType} from "../../../core/utils/enums";

@Injectable()
export class UserStoryService {

    constructor(
        private readonly storyService: StoryService,
        private readonly s3: FileUploaderService,
        private readonly userBanService: UserBanService,
        private readonly userService: UserService,
        private readonly storyAttachmentService: StoryAttachmentService,
        private readonly channelService: ChannelService,
        private readonly messageChannelService: MessageChannelService,
        private readonly memoryService: MemoryService,
        private readonly socketIoService: SocketIoService,
    ) {
    }

    async create(dto: CreateStoryDto) {
        let exceptPeople = [];

        if (!dto.isText() && !dto._mediaFile)
            throw new BadRequestException("file data required");
        if (dto._mediaFile) {
            let thumbFile = null
            let mainFileKey = await this._uploadFile(dto._mediaFile, dto.myUser);
            if (dto._secondMediaFile) {
                thumbFile = await this._uploadFile(dto._secondMediaFile, dto.myUser);
            }
            dto.att = {
                ...jsonDecoder(dto.attachment),
                fileSize: dto._mediaFile.size,
                mimeType: dto._mediaFile.mimetype,
                name: dto._mediaFile.originalname,
                url: mainFileKey,
                thumbUrl: thumbFile
            };
        }

        // Handle story privacy logic
        exceptPeople = await this.userBanService.getMyBlockTheyAndMe(dto.myUser._id)
        exceptPeople.push(dto.myUser._id)

        console.log('Story privacy processing:', {
            storyPrivacy: dto.storyPrivacy,
            originalSomePeople: dto.somePeople,
            exceptPeopleCount: exceptPeople.length
        });

        // Only override somePeople if privacy is Public
        if (dto.storyPrivacy === StoryPrivacy.Public || !dto.storyPrivacy) {
            // For public stories, include all users except blocked ones
            dto.somePeople = (await this.userService.findAll({
                _id: {$nin: exceptPeople},
            })).map(user => user._id);
            console.log('Public story - somePeople set to all users:', dto.somePeople.length);
        } else if (dto.storyPrivacy === StoryPrivacy.SomePeople) {
            // For selected people stories, keep the provided somePeople list
            // but filter out blocked users
            if (dto.somePeople && dto.somePeople.length > 0) {
                const originalCount = dto.somePeople.length;
                dto.somePeople = dto.somePeople.filter(userId => !exceptPeople.includes(userId));
                console.log(`Selected people story - filtered from ${originalCount} to ${dto.somePeople.length} users`);
            } else {
                // If no people selected, make it an empty array (story won't be visible to anyone)
                dto.somePeople = [];
                console.log('Selected people story - no people selected, setting to empty array');
            }
        } else if (dto.storyPrivacy === StoryPrivacy.MyContactsExcept) {
            // For "my contacts except" stories, include all users except blocked ones and excluded ones
            const allExceptPeople = [...exceptPeople];
            if (dto.exceptPeople && dto.exceptPeople.length > 0) {
                // Add the excluded people to the list
                allExceptPeople.push(...dto.exceptPeople);
            }
            dto.somePeople = (await this.userService.findAll({
                _id: {$nin: allExceptPeople},
            })).map(user => user._id);
            console.log('MyContactsExcept story - somePeople set to all users except excluded:', dto.somePeople.length);
        }

        let story = await this.storyService.create(dto.toJson());
        delete story['somePeople']
        let att = await this.storyAttachmentService.create({
            storyId: story ["_id"],
            likes: [],
            reply: [],
            shares: [],
        });

        // Automatically save story to memories
        try {
            console.log('Attempting to save story to memories:', {
                userId: dto.myUser._id,
                storyId: story["_id"],
                storyType: story.storyType
            });

            const memory = await this.memoryService.create({
                userId: dto.myUser._id.toString(),
                storyId: story["_id"].toString(),
                originalStoryData: story,
                savedAt: new Date(),
                reminderDate: this.calculateReminderDate(),
                isReminderEnabled: true,
                tags: [],
            });

            console.log('Successfully saved story to memories:', memory._id);
        } catch (error) {
            // Log error but don't fail story creation
            console.error('Failed to save story to memories:', error);
        }

        return {
            ...story,
            storyAttachment: {
                ...att,
                likes: 0,
                reply: 0,
                shares: 0,
            },
        };
    }

    async getMyStories(myId: string) {
        let myStories = await this.storyService.findAll({
            expireAt: {$gte: new Date()},
            userId: myId
        })
    }


    async findAll(myId: string, dto: object) {
        let blocked = [];
        let myIdObj = newMongoObjId(myId);
        blocked.push(myIdObj);
        let paginationParameters = new PaginationParameters({
            query: {
                limit: 30,
                page: 1,
                sort: "-_id",
                ...dto,
            },
        }).get();
        return this.storyService.aggregateV2(
            this.storyStages(myIdObj, {
                expireAt: {$gte: new Date()},
                userId: {$nin: blocked},
                somePeople: myIdObj,
            }),
            paginationParameters[1].page,
            paginationParameters[1].limit
        );
    }

    private storyStages(myIdObj: any, match: {}) {
        return [
            {
                $match: match
            },
            {
                $sort: {
                    _id: -1
                }
            },
            {
                $group: {
                    _id: "$userId",
                    stories: {$push: "$$ROOT"}
                }
            },
            {
                $sort: {
                    'stories._id': -1
                }
            },

            {
                $addFields: {
                    stories: {
                        $map: {
                            input: "$stories",
                            as: "story",
                            in: {
                                _id: "$$story._id",
                                userId: "$$story.userId",
                                content: "$$story.content",
                                backgroundColor: "$$story.backgroundColor",
                                caption: "$$story.caption",
                                storyType: "$$story.storyType",
                                att: "$$story.att",
                                fontType: "$$story.fontType",
                                expireAt: "$$story.expireAt",
                                createdAt: "$$story.createdAt",
                                updatedAt: "$$story.updatedAt",
                                viewedByMe: {
                                    $in: [myIdObj, "$$story.views.viewerId"]
                                }
                            }
                        }
                    }
                }
            },

            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "userData"
                }
            },
            {
                $project: {
                    _id: 0,
                    stories: 1,
                    userData: {$arrayElemAt: ["$userData", 0]}
                }
            },
            {
                $project: {
                    stories: 1,
                    userData: {
                        fullName: 1,
                        _id: 1,
                        userImage: 1
                    }
                }
            }
        ];
    }

    async remove(dto: MongoIdDto) {
        let story = await this.storyService.findByIdOrThrow(dto.id);
        if (story.userId != dto.myUser._id)
            throw new ForbiddenException(
                "You dont have access to delete story not belong to you"
            );

        // Delete the story
        await this.storyService.findByIdAndDelete(dto.id);

        // Emit socket event to notify all connected clients about story deletion
        this.socketIoService.io.emit(SocketEventsType.v1OnStoryDeleted, JSON.stringify({
            storyId: dto.id,
            userId: story.userId,
            deletedAt: new Date(),
            deletedBy: 'user'
        }));

        return "Deleted";
    }

    async addView(dto: MongoIdDto) {
        await this.storyService.findOneAndUpdate(
            {
                _id: dto.id,
                "views.viewerId": {$ne: newMongoObjId(dto.myUser._id)},
                userId: {$ne: dto.myUser._id},
            },
            {
                $addToSet: {
                    views: {
                        viewerId: newMongoObjId(dto.myUser._id),
                        viewedAt: new Date(),
                    },
                },
            },
            null
        );
        return "added";
    }

    async getView(dto: MongoIdDto, query: object) {
        let story = await this.storyService.findByIdOrThrow(dto.id);
        if (story.userId != dto.myUser._id)
            throw new BadRequestException("This not your story!");
        let storyId = newMongoObjId(dto.id);

        let page = 1;
        let limit = 30;
        if (query["page"]) {
            page = parseInt(query["page"]);
        }

        if (query["limit"]) {
            limit = parseInt(query["limit"]);
        }
        let skip = (page - 1) * limit;

        return this.storyService.aggregate([
            {
                $match: {
                    _id: storyId, // Match the specific story
                },
            },
            {
                $unwind: "$views", // Deconstruct the views array
            },
            {
                $skip: skip, // Skip documents for pagination
            },
            {
                $limit: limit, // Limit the number of documents for pagination
            },
            {
                $lookup: {
                    from: "users",
                    localField: "views.viewerId",
                    foreignField: "_id",
                    as: "views.viewerInfo",
                },
            },

            {
                $unwind: "$views.viewerInfo", // Unwind the populated viewerInfo
            },
            {
                $group: {
                    // Group back the views
                    _id: "$_id",
                    views: {
                        $push: {
                            viewerId: "$views.viewerId",
                            viewedAt: "$views.viewedAt",
                            viewerInfo: "$views.viewerInfo",
                        },
                    },
                },
            },
            {
                $project: {
                    "views.viewerInfo._id": 1,
                    "views.viewedAt": 1,
                    "views.viewerInfo.fullName": 1,
                    "views.viewerInfo.bio": 1,
                    "views.viewerInfo.userImage": 1,
                },
            },
        ]);
    }

    async myStories(myId: string) {
        let myIdObj = newMongoObjId(myId);
        let paginationParameters = new PaginationParameters({
            query: {
                limit: 30,
                page: 1,
                sort: "-_id",
            },
        }).get();
        return await this.storyService.aggregateV2(
            this.storyStages(myIdObj, {
                expireAt: {$gte: new Date()},
                userId: myIdObj,
            }),
            paginationParameters[1].page,
            paginationParameters[1].limit
        );
    }

    private async _uploadFile(
        _mediaFile: Express.Multer.File,
        myUser: IUser
    ) {
        let uploaderDto = new CreateS3UploaderDto();
        uploaderDto.mediaBuffer = _mediaFile.buffer;
        uploaderDto.myUser = myUser;
        uploaderDto.fileName = _mediaFile.originalname;
        return await this.s3.uploadChatMedia(uploaderDto);
    }

    async reactToStory(storyId: string, userId: string, emoji: string = '❤️') {
        // First, toggle the like on the story attachment
        const likeResult = await this.storyAttachmentService.toggleLike(storyId, userId);

        // Get the story to find the story owner
        const story = await this.storyService.findByIdOrThrow(storyId);
        const storyOwnerId = story.userId;

        // Don't create a chat message if liking your own story or if unliking
        if (userId === storyOwnerId || !likeResult.liked) {
            return likeResult;
        }

        // Get the user who liked the story
        const likeUser = await this.userService.findByIdOrThrow(userId);

        try {
            // Create or get existing room between the liker and story owner
            const peerDto = new MongoPeerIdDto(storyOwnerId, likeUser);

            const room = await this.channelService.getOrCreatePeerRoom(peerDto);

            console.log('Story like room object:', room);

            // Extract room ID from the room object
            const roomId = room.rId;

            if (!roomId) {
                throw new Error('Could not extract room ID from room object');
            }

            // Create a custom message with story information
            const messageDto = new SendMessageDto();
            messageDto.content = emoji; // Use the provided emoji as the message content
            messageDto.localId = uuidv4();
            messageDto.messageType = MessageType.Custom; // Use custom type for story likes
            messageDto.myUser = likeUser;
            messageDto._roomId = roomId;
            messageDto._platform = likeUser.currentDevice?.platform || 'other';

            // Create story attachment for the message
            const storyAttachment = {
                type: 'story_like',
                storyId: storyId,
                storyType: story.storyType,
                storyContent: story.content,
                storyCaption: story.caption,
                storyAtt: story.att, // Story media/attachment
                backgroundColor: story.backgroundColor,
                textColor: story.textColor,
                emoji: emoji, // Include the emoji used for the reaction
            };

            console.log('Story like attachment object:', storyAttachment);

            // For custom messages, we need to wrap the data in a 'data' field
            // The VCustomMsgData.fromMap expects this structure: { data: { ... } }
            const customMessageData = {
                data: storyAttachment
            };

            // For custom messages, we need to set the attachment field as JSON string
            // The getMessageAttachment method will parse this and set it as msgAtt
            messageDto.attachment = JSON.stringify(customMessageData);

            console.log('Like attachment JSON string:', messageDto.attachment);
            console.log('Like message DTO:', {
                messageType: messageDto.messageType,
                content: messageDto.content,
                attachment: messageDto.attachment,
                roomId: messageDto._roomId
            });

            // Create the message in the chat
            await this.messageChannelService.createMessage(messageDto);

        } catch (error) {
            // If chat message creation fails, log the error but don't fail the story like
            console.error('Failed to create chat message for story like:', error);
        }

        return likeResult;
    }

    async replyToStory(storyId: string, userId: string, text: string) {
        // First, add the reply to the story attachment
        const replyResult = await this.storyAttachmentService.addReply(storyId, userId, text);

        // Get the story to find the story owner
        const story = await this.storyService.findByIdOrThrow(storyId);
        const storyOwnerId = story.userId;

        // Don't create a chat message if replying to your own story
        if (userId === storyOwnerId) {
            return replyResult;
        }

        // Get the user who replied to the story
        const replyUser = await this.userService.findByIdOrThrow(userId);

        try {
            // Create or get existing room between the replier and story owner
            const peerDto = new MongoPeerIdDto(storyOwnerId, replyUser);

            const room = await this.channelService.getOrCreatePeerRoom(peerDto);

            // Extract room ID from the room object
            const roomId = room.rId;

            if (!roomId) {
                throw new Error('Could not extract room ID from room object');
            }

            // Create a custom message with story information
            const messageDto = new SendMessageDto();
            messageDto.content = text; // The actual reply text
            messageDto.localId = uuidv4();
            messageDto.messageType = MessageType.Custom; // Use custom type for story replies
            messageDto.myUser = replyUser;
            messageDto._roomId = roomId;
            messageDto._platform = replyUser.currentDevice?.platform || 'other';

            // Create story attachment for the message
            const storyAttachment = {
                type: 'story_reply',
                storyId: storyId,
                storyType: story.storyType,
                storyContent: story.content,
                storyCaption: story.caption,
                storyAtt: story.att, // Story media/attachment
                backgroundColor: story.backgroundColor,
                textColor: story.textColor,
                replyText: text
            };

            // For custom messages, we need to wrap the data in a 'data' field
            // The VCustomMsgData.fromMap expects this structure: { data: { ... } }
            const customMessageData = {
                data: storyAttachment
            };

            // For custom messages, we need to set the attachment field as JSON string
            // The getMessageAttachment method will parse this and set it as msgAtt
            messageDto.attachment = JSON.stringify(customMessageData);
            messageDto.mentions = [];

            // Debug logging
            console.log('Story attachment object:', storyAttachment);
            console.log('Attachment JSON string:', messageDto.attachment);
            console.log('Message DTO:', {
                messageType: messageDto.messageType,
                content: messageDto.content,
                attachment: messageDto.attachment,
                roomId: messageDto._roomId
            });

            // Add a delay to ensure room is properly set up
            await new Promise(resolve => setTimeout(resolve, 500));

            // Create the message in the chat
            await this.messageChannelService.createMessage(messageDto);

        } catch (error) {
            // If chat message creation fails, log the error but don't fail the story reply
            console.error('Failed to create chat message for story reply:', error);
        }

        return replyResult;
    }

    async getStoryViewsCount(storyId: string) {
        const story = await this.storyService.findByIdOrThrow(storyId);
        return { viewsCount: story.views ? story.views.length : 0 };
    }

    private calculateReminderDate(): Date {
        // Set reminder for next year on the same date
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        return nextYear;
    }
}
