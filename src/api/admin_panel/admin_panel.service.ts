/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {Injectable} from "@nestjs/common";
import {UpdateConfigDto} from "./dto/update_config_dto";
import {AppConfigService} from "../app_config/app_config.service";
import {UserService} from "../user_modules/user/user.service";
import {FileUploaderService} from "../../common/file_uploader/file_uploader.service";
import {ConfigService} from "@nestjs/config";
import {UserDeviceService} from "../user_modules/user_device/user_device.service";
import {newMongoObjId} from "../../core/utils/utils";
import {MongoIdDto} from "../../core/common/dto/mongo.id.dto";
import {CreateNewVersionDto, GetVersionDto} from "./dto/admin_dto";
import {CreateAdminNotificationDto} from "../admin_notification/dto/create-admin_notification.dto";
import {UserAdminService} from "./other/user_admin.service";
import {UserCountryAdminService} from "./other/user_country_admin.service";
import {VersionsAdminService} from "./other/versions_admin.service";
import {UserDeviceAdminService} from "./other/user_device_admin.service";
import {SocketIoService} from "../../chat/socket_io/socket_io.service";
import {ChannelAdminService} from "./other/channel_admin_service";
import {ChannelService} from "../../chat/channel/services/channel.service";
import {MessageService} from "../../chat/message/message.service";
import {MessagesSearchDto} from "../../chat/message/dto/messages_search_dto";
import {ReportSystemService} from "../report_system/report_system.service";
import {PaginationParameters} from "mongoose-paginate-v2";
import {Platform, UserRole, SocketEventsType} from "../../core/utils/enums";
import {AdminNotificationService} from "../admin_notification/admin_notification.service";
import {NotificationEmitterAdminService} from "./other/notification_emitter_admin.service";
import {GroupMemberService} from "../../chat/group_member/group_member.service";
import {GroupSettingsService} from "../../chat/group_settings/group_settings.service";
import {StoryService} from "../stories/story/story.service";
import {GiftService} from "../gifts/gift.service";
import {CreateS3UploaderDto} from "../../common/file_uploader/create-s3_uploader.dto";


@Injectable()
export class AdminPanelService {
    constructor(
        private readonly appConfigService: AppConfigService,
        private readonly userService: UserService,
        private readonly socket: SocketIoService,
        private readonly fileUploaderService: FileUploaderService,
        private readonly versionsAdminService: VersionsAdminService,
        private readonly configService: ConfigService,
        private readonly userDeviceService: UserDeviceService,
        private readonly userDeviceAdminService: UserDeviceAdminService,
        private readonly countryAdminService: UserCountryAdminService,
        private readonly userAdminService: UserAdminService,
        private readonly channelAdminService: ChannelAdminService,
        private readonly channelService: ChannelService,
        private readonly messageService: MessageService,
        private reportSystemService: ReportSystemService,
        private emitterAdminService: NotificationEmitterAdminService,
        private adminNotificationService: AdminNotificationService,
        private readonly uploaderService: FileUploaderService,
        private readonly groupMemberService: GroupMemberService,
        private readonly groupSettingsService: GroupSettingsService,
        private readonly storyService: StoryService,
        private readonly socketIoService: SocketIoService,
        private readonly giftService: GiftService,
    ) {
    }

    async updateConfig(dto: UpdateConfigDto) {
        let config = await this.appConfigService.getConfig();
        if (!config) throw new Error("Config not found");
        return await this.appConfigService.insert({
            ...config,
            ...dto,
            _id: newMongoObjId().toString()
        });
    }

    async getAppConfig() {
        return this.appConfigService.getConfig();
    }

    async setNewVersion(dto: CreateNewVersionDto) {
        return this.versionsAdminService.setNewVersion(dto)
    }

    async getVersions(platform: GetVersionDto) {
        return this.versionsAdminService.getVersions(platform);
    }

    async deleteVersion(id: MongoIdDto) {
        return this.versionsAdminService.deleteVersion(id);
    }

    async createNotification(dto: CreateAdminNotificationDto) {
        if (dto.imageBuffer) {
            dto.imageUrl = await this.uploaderService.putImageCropped(dto.imageBuffer, "admin");
        }
        await this.adminNotificationService.create(dto)
        await this.emitterAdminService.emitNotification(dto)
        return "Done"
    }


    async getUserInfo(dto: MongoIdDto) {
        let isOnline = await this.socket.getOnlineFromList([dto.id])
        let data = await this.countryAdminService.getUserCountries(dto.id);
        let userCountries = [];
        for (let i of data) {
            try {
                userCountries.push(i["data"][0]);
            } catch (err) {
                console.log("Error while get userCountryService getCountriesInfo for loop!");
            }
        }

        return {
            "userInfo": {
                ...(await this.userService.findById(dto.id, null, {
                    populate: "countryId"
                })),
                "isOnline": isOnline.length > 0
            },
            "visits": await this.userDeviceAdminService.getUserVisits(dto.id),
            "userDevices": await this.userDeviceService.findAll({
                uId: dto.id
            }),
            "userCountries": userCountries,
            "userReports": await this.reportSystemService.findAll({
                targetId: dto.id,
                isDeleted: false
            }, null, {
                populate: {
                    path: "uId",
                    select: "fullName verifiedAt userImage registerStatus banTo lastSeenAt bio"
                },
                limit: 30,
            }),
            "chats": {
                "messagesCounter": await this.channelAdminService.getMessagesCounterForPeer(dto.id),
                "roomCounter": await this.channelAdminService.getRoomCounterForPeer(dto.id)
            }
        };
    }

    async getUsers(dto: Object) {
        return this.userAdminService.getUsers(dto);
    }

    async getUsersDashboardInfo() {
        return {
            "usersData": await this.userAdminService.getUsersData(),
            "usersDevices": await this.userDeviceAdminService.getUsersDevicesInfo(),
            "statistics": {
                "visits": await this.userDeviceAdminService.getTotalVisits(),
                "iosVisits": await this.userDeviceAdminService.getPlatformVisits(Platform.Ios),
                "androidVisits": await this.userDeviceAdminService.getPlatformVisits(Platform.Android),
                "webVisits": await this.userDeviceAdminService.getPlatformVisits(Platform.Web),
                "otherVisits": await this.userDeviceAdminService.getPlatformVisits(Platform.Other),
            },
            "usersCountries": await this.countryAdminService.getCountriesInfo()
        };
    }

    async getNotification() {
        return this.adminNotificationService.findAll({}, null, {sort: "-_id"})
    }

    async getUserChats(peerId: string, filter: object) {
        return this.channelService.getRoomsLimited(filter, peerId)
        ///there are two type of notification users join admin push
    }


    async getCountriesInfo() {
        return this.countryAdminService.getCountriesInfo();
    }

    async getChatDashboardInfo() {
        return {
            "messagesCounter": await this.channelAdminService.getMessagesCounter(),
            "roomCounter": await this.channelAdminService.getRoomCounter()
        }
    }

    async updateUserInfo(id: string, body: object) {
        let user = await this.userService.findByIdOrThrow(id)
        if (body['hasBadge'] == true) {
            body['roles'] = [...user.roles, UserRole.HasBadge]
        }
        if (body['hasBadge'] == false) {
            body['roles'] = [...user.roles]
            body['roles'] = body['roles'].filter((item: UserRole) => item !== UserRole.HasBadge);
        }
        await this.userAdminService.updateUserData(id, body)
        return "Done"
    }

    async getUserChatsMessages(userId: string, roomId: string, filter: object) {
        let dto = new MessagesSearchDto()
        dto.lastId = filter['lastId']
        dto.limit = filter['limit']
        return this.messageService.findAllMessagesAggregation(newMongoObjId(userId), newMongoObjId(roomId), dto)
    }

    async getUserReports(dto: object) {
        let paginationParameters = new PaginationParameters({
                query: {
                    limit: 50,
                    page: 1,
                    sort: "-_id",
                    ...dto,
                    populate: [
                        {
                            path: 'uId',
                            select: "fullName verifiedAt userImage registerStatus banTo lastSeenAt bio"
                        },
                        {
                            path: 'targetId',
                            select: "fullName verifiedAt userImage registerStatus banTo lastSeenAt bio"
                        }
                    ]
                },

            }
        ).get()
        delete dto['limit']
        delete dto['page']
        paginationParameters[0] = dto;

        return this.reportSystemService.paginate(paginationParameters)
    }

    async deleteReport(id: string) {
        await this.reportSystemService.findByIdAndDelete(id)
        return "Done"
    }

    async getUsersLog() {
        return this.userAdminService.getUsersLog()
    }

    async login(x) {
        return {
            isViewer: x
        }
    }

    async getDashboard() {
        return {
            ...await this.getUsersDashboardInfo(),
            ...await this.getChatDashboardInfo(),
        }
    }

    async getUserGroups(userId: string, filter: object) {
        let paginationParameters = new PaginationParameters({
            query: {
                limit: 30,
                page: 1,
                sort: "-_id",
                ...filter,
            },
        }).get();

        // Get groups where user is a member
        const groupMembers = await this.groupMemberService.findAll({
            uId: userId
        }, null, {
            populate: {
                path: 'rId',
                select: 'gName gImg cId createdAt'
            },
            ...paginationParameters[1]
        });

        // Get group settings for each group
        const groupsWithDetails = await Promise.all(
            groupMembers.map(async (member) => {
                const groupSettings = await this.groupSettingsService.findById(member.rId);
                const memberCount = await this.groupMemberService.findCount({ rId: member.rId });

                return {
                    groupId: member.rId,
                    groupName: groupSettings?.gName || 'Unknown Group',
                    groupImage: groupSettings?.gImg || '',
                    creatorId: groupSettings?.cId || '',
                    memberRole: member.gR,
                    memberCount: memberCount,
                    createdAt: groupSettings?.createdAt || member.createdAt,
                    joinedAt: member.createdAt
                };
            })
        );

        return {
            groups: groupsWithDetails,
            totalCount: groupsWithDetails.length
        };
    }

    async deleteGroup(groupId: string) {
        // Delete group settings
        await this.groupSettingsService.findByIdAndDelete(groupId);

        // Delete all group members
        await this.groupMemberService.deleteMany({ rId: groupId });

        // Delete all messages in the group
        await this.messageService.deleteWhere({ rId: groupId });

        return "Group deleted successfully";
    }

    async getGroupMembers(groupId: string, filter: object) {
        let paginationParameters = new PaginationParameters({
            query: {
                limit: 50,
                page: 1,
                sort: "-_id",
                ...filter,
            },
        }).get();

        const members = await this.groupMemberService.findAll({
            rId: groupId
        }, null, {
            populate: {
                path: 'uId',
                select: 'fullName userImage verifiedAt registerStatus banTo lastSeenAt'
            },
            ...paginationParameters[1]
        });

        return {
            members: members.map(member => ({
                userId: member.uId.toString(),
                userData: member.userData,
                role: member.gR,
                joinedAt: member.createdAt
            })),
            totalCount: members.length
        };
    }

    async getUserStories(userId: string, filter: object) {
        let paginationParameters = new PaginationParameters({
            query: {
                limit: 30,
                page: 1,
                sort: "-_id",
                ...filter,
            },
        }).get();

        const stories = await this.storyService.findAll({
            userId: userId
        }, null, {
            ...paginationParameters[1]
        });

        return {
            stories: stories.map(story => ({
                storyId: story._id,
                content: story.content,
                storyType: story.storyType,
                storyPrivacy: story.storyPrivacy,
                caption: story.caption,
                backgroundColor: story.backgroundColor,
                textColor: story.textColor,
                textAlign: story.textAlign,
                fontType: story.fontType,
                attachment: story.att,
                views: story.views ? story.views.length : 0,
                createdAt: story.createdAt,
                expireAt: story.expireAt
            })),
            totalCount: stories.length
        };
    }

    async deleteStory(storyId: string) {
        // Get the story before deleting to get the userId
        const story = await this.storyService.findByIdOrThrow(storyId);
        const userId = story.userId;

        // Delete the story
        await this.storyService.findByIdAndDelete(storyId);

        // Emit socket event to notify all connected clients about story deletion
        this.socketIoService.io.emit(SocketEventsType.v1OnStoryDeleted, JSON.stringify({
            storyId: storyId,
            userId: userId,
            deletedAt: new Date(),
            deletedBy: 'admin'
        }));

        return "Story deleted successfully";
    }

    // Gift Management Methods
    async getGifts(filter: object = {}) {
        const gifts = await this.giftService.findAll(filter, null, {
            sort: { createdAt: -1 }
        });

        return {
            gifts: gifts.map(gift => ({
                id: gift._id.toString(),
                name: gift.name,
                description: gift.description,
                imageUrl: gift.imageUrl,
                price: gift.price,
                isActive: gift.isActive,
                createdAt: gift.createdAt,
                updatedAt: gift.updatedAt
            })),
            totalCount: gifts.length
        };
    }

    async createGift(data: {
        name: string;
        description?: string;
        price: number;
        isActive?: boolean;
    }, imageFile?: any) {
        if (!imageFile) {
            throw new Error('Image file is required for creating a gift');
        }

        const uploaderDto = new CreateS3UploaderDto();
        uploaderDto.mediaBuffer = imageFile.buffer;
        uploaderDto.fileName = imageFile.originalname;
        uploaderDto.myUser = { _id: 'admin' } as any;
        const imageUrl = await this.fileUploaderService.uploadChatMedia(uploaderDto);

        const gift = await this.giftService.create({
            name: data.name,
            description: data.description,
            imageUrl: imageUrl,
            price: data.price,
            isActive: data.isActive !== undefined ? data.isActive : true,
        });

        return {
            id: gift._id.toString(),
            name: gift.name,
            description: gift.description,
            imageUrl: gift.imageUrl,
            price: gift.price,
            isActive: gift.isActive,
            createdAt: gift.createdAt,
            updatedAt: gift.updatedAt
        };
    }

    async updateGift(giftId: string, data: {
        name?: string;
        description?: string;
        price?: number;
        isActive?: boolean;
    }, imageFile?: any) {
        const updateData: any = { ...data };

        if (imageFile) {
            const uploaderDto = new CreateS3UploaderDto();
            uploaderDto.mediaBuffer = imageFile.buffer;
            uploaderDto.fileName = imageFile.originalname;
            uploaderDto.myUser = { _id: 'admin' } as any;
            updateData.imageUrl = await this.fileUploaderService.uploadChatMedia(uploaderDto);
        }

        const gift = await this.giftService.findByIdAndUpdate(giftId, updateData);

        if (!gift) {
            throw new Error('Gift not found');
        }

        return {
            id: gift._id.toString(),
            name: gift.name,
            description: gift.description,
            imageUrl: gift.imageUrl,
            price: gift.price,
            isActive: gift.isActive,
            createdAt: gift.createdAt,
            updatedAt: gift.updatedAt
        };
    }

    async deleteGift(giftId: string) {
        await this.giftService.findByIdAndDelete(giftId);
        return "Gift deleted successfully";
    }

    async getGiftById(giftId: string) {
        const gift = await this.giftService.findByIdOrThrow(giftId);

        return {
            id: gift._id.toString(),
            name: gift.name,
            description: gift.description,
            imageUrl: gift.imageUrl,
            price: gift.price,
            isActive: gift.isActive,
            createdAt: gift.createdAt,
            updatedAt: gift.updatedAt
        };
    }
}
