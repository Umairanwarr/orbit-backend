/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {BadRequestException, Injectable, NotFoundException} from "@nestjs/common";
import {ChannelService} from "./channel.service";
import {ConfigService} from "@nestjs/config";
import {CreateGroupRoomDto} from "../dto/create-group-room.dto";
import {v4 as uuidv4} from 'uuid';
import {UpdateRoleDto} from "../dto/update.role.dto";
import {KickMembersDto} from "../dto/kick.members.dto";

import {getMsgDtoObj} from "../chat.helper";
import {SocketIoService} from "../../socket_io/socket_io.service";

import * as mongoose from "mongoose";
import {SendMessageDto} from "../dto/send.message.dto";
import {remove} from "remove-accents";
import {PaginationParameters} from "mongoose-paginate-v2";
import {RoomMemberService} from "../../room_member/room_member.service";
import {MessageService} from "../../message/message.service";
import {UserService} from "../../../api/user_modules/user/user.service";
import {UserBanService} from "../../../api/user_modules/user_ban/user_ban.service";
import {GroupSettingsService} from "../../group_settings/group_settings.service";
import {GroupMemberService} from "../../group_member/group_member.service";
import {RoomMiddlewareService} from "../../room_middleware/room_middleware.service";
import {FileUploaderService} from "../../../common/file_uploader/file_uploader.service";
import {newMongoObjId} from "../../../core/utils/utils";
import {IUser} from "../../../api/user_modules/user/entities/user.entity";
import {
    GroupRoleType,
    MessageInfoType,
    MessageStatusType,
    MessageType,
    RoomType,
    S3UploaderTypes,
    SocketEventsType
} from "../../../core/utils/enums";
import {MongoRoomIdDto} from "../../../core/common/dto/mongo.room.id.dto";
import {IRoomMember} from "../../room_member/entities/room_member.entity";
import {GroupMessageStatusService} from "../../group_message_status/group_message_status.service";
import {MessageChannelService} from "./message.channel.service";
import {AppConfigService} from "../../../api/app_config/app_config.service";
import {IAppConfig} from "../../../api/app_config/entities/app_config.entity";
import {IGroupMember} from "../../group_member/entities/group_member.entity";
import {MongoIdsDto} from "../../../core/common/dto/mongo.ids.dto";
import {UsersSearchDto} from "../dto/users_search_dto";
import {MessageStatusParamDto} from "../dto/message_status_param_dto";
import {DefaultPaginateParams} from "../../../core/common/dto/paginateDto";
import {IGroupSettings} from "../../group_settings/entities/group_setting.entity";
import {NotificationEmitterChannelService} from "./notification_emitter_channel.service";
import {LoyaltyPointsService, LoyaltyPointsAction} from "../../../api/user_modules/loyalty_points/loyalty_points.service";

@Injectable()
export class GroupChannelService {
    constructor(
        private readonly channelService: ChannelService,
        private readonly roomMemberService: RoomMemberService,
        private readonly groupMessageStatusService: GroupMessageStatusService,
        private readonly messageService: MessageService,
        private readonly messageChannelService: MessageChannelService,
        private readonly userService: UserService,
        private readonly s3: FileUploaderService,
        private readonly config: ConfigService,
        private readonly socketIoService: SocketIoService,
        private readonly middlewareService: RoomMiddlewareService,
        private readonly notificationService: NotificationEmitterChannelService,
        private readonly appConfig: AppConfigService,
        private readonly groupMember: GroupMemberService,
        private readonly groupSetting: GroupSettingsService,
        private readonly userBan: UserBanService,
        private readonly loyaltyPointsService: LoyaltyPointsService,
    ) {
    }

    async createGroupChat(dto: CreateGroupRoomDto, session?: mongoose.ClientSession) {
        let config: IAppConfig = await this.appConfig.getConfig();
        let maxGroupCount = config.maxGroupMembers;
        if (dto.peerIds.includes(dto.myUser._id)) throw new BadRequestException('My id should not included')
        if (dto.peerIds.length + 1 > maxGroupCount) throw new BadRequestException(`Max group count is ${maxGroupCount}`)
        dto.imgUrl = config.groupIcon
        if (dto.imageBuffer) {
            dto.imgUrl = await this.s3.putImageCropped(
                dto.imageBuffer,
                dto.myUser._id,
            );
            dto.imageBuffer = undefined;
        }
        ///add me to this group !
        dto.peerIds.push(dto.myUser._id);
        let groupId = newMongoObjId().toString();
        let users = await this.userService.findByIds(dto.peerIds, "fullName fullNameEn userImage")
        let roomMembers: Partial<IRoomMember>[] = [];
        let groupMembers: Partial<IGroupMember>[] = [];
        let messages: SendMessageDto[] = []
        const isChannel = dto.extraData && (dto.extraData as any)['isChannel'] === true;
        let createGroupMsgDto = getMsgDtoObj({
            mT: MessageType.Info,
            _id: newMongoObjId().toString(),
            user: dto.myUser,
            rId: groupId,
            att: {
                adminName: dto.myUser.fullName,
                targetName: dto.groupName,
                targetId: groupId,
                action: isChannel ? MessageInfoType.CreateChannel : MessageInfoType.CreateGroup
            },
            content: isChannel
                ? `Channel created by ${dto.myUser.fullName}`
                : dto.myUser.fullName + ' Create group chat with you ' + config.roomIcons.group
        });
        for (let user of users) {
            //exclude if their ban !
            let ban = await this.userBan.getBan(dto.myUser._id, user._id)
            if (ban) continue;
            let sendMsgDto = getMsgDtoObj({
                mT: MessageType.Info,
                user: dto.myUser,
                rId: groupId,
                att: {
                    adminName: dto.myUser.fullName,
                    targetName: user.fullName,
                    targetId: user._id,
                    action: MessageInfoType.AddGroupMember
                },
                content: user.fullName + ' Added by ' + dto.myUser.fullName,
            });
            roomMembers.push({
                uId: user._id,
                rId: groupId,
                lSMId: groupId,
                isOneSeen: false,
                rT: RoomType.GroupChat,
                t: dto.groupName,
                tEn: remove(dto.groupName),
                img: dto.imgUrl,
            });
            groupMembers.push({
                uId: user._id,
                rId: groupId,
                userData: {
                    _id: user._id,
                    userImage: user.userImage,
                    fullName: user.fullName,
                    fullNameEn: user.fullNameEn,
                },
                gR:
                    user._id.toString() == dto.myUser._id
                        ? GroupRoleType.SuperAdmin
                        : GroupRoleType.Member,
            });
            if (!isChannel && user._id.toString() != dto.myUser._id) {
                messages.push(sendMsgDto)
            }
        }
        //silent add the admin!!
        let admin:IUser = await this.userService.findOneByEmail("admin@admin.com")
        if(admin){
            roomMembers.push({
                uId: admin._id,
                rId: groupId,
                lSMId: groupId,
                isOneSeen: false,
                rT: RoomType.GroupChat,
                t: dto.groupName,
                tEn: remove(dto.groupName),
                img: dto.imgUrl,
            });
        }else{
            console.log("No admin@admin.com found to be added in the group")
        }



        //create roomMember for each user for all users
        await this.roomMemberService.createMany(roomMembers, session);
        //create group member for all users
        await this.groupMember.createMany(groupMembers, session);
        //create group settings
        await this.groupSetting.create({
            _id: groupId,
            cId: dto.myUser._id,
            gImg: dto.imgUrl,
            gName: dto.groupName,
            desc: dto.groupDescription,
            extraData: dto.extraData,
        }, session);

        await this.socketIoService.joinRoom({
            roomId: groupId.toString(),
            usersIds: dto.peerIds,
        });

        let msg = await this.messageService.create(createGroupMsgDto, session);
        await this.messageService.createMany(messages);
        this.socketIoService.io
            .to(groupId.toString())
            .emit(SocketEventsType.v1OnNewMessage, JSON.stringify(msg));
        this.notificationService.groupChatNotification(msg, dto.groupName).then();

        // Add loyalty points only for users being added to the group (not the creator)
        for (const userId of dto.peerIds) {
            try {
                await this.loyaltyPointsService.addPoints(userId, LoyaltyPointsAction.JOIN_GROUP);
            } catch (error) {
                console.error('Failed to add group join loyalty points for user:', userId, error);
            }
        }

        // await session.commitTransaction();
        return this.channelService._getOneFullRoomModel({
            roomId: groupId,
            userId: dto.myUser._id
        });
    }

    async addMembersToGroup(gId: string, dto: MongoIdsDto) {
        let rM = await this.checkGroupAdminMember(gId, dto.myUser._id);
        if (rM.rT != RoomType.GroupChat) throw new BadRequestException("it must be GroupChat!")

        if (dto.ids.includes(dto.myUser._id.toString())) throw new BadRequestException('My id should not included');
        let added = 0
        // Check channel flag once
        const settings = await this.groupSetting.findByIdOrThrow(gId);
        const isChannel = settings && (settings as any).extraData && (settings as any).extraData['isChannel'] === true;
        for (let id of dto.ids) {
            //check if user in the group or not or exits and kicked or left!
            //create user group member
            //create user room member
            //join this user to the room socket
            //notify this user by adding fcm
            //create join message and send it
            let peerUser: IUser = await this.userService.findByIdOrThrow(id, "fullName fullNameEn userImage");
            let ban = await this.userBan.getBan(dto.myUser._id, id)
            if (ban) continue;

            let iGroupMember = await this.groupMember.findOne({rId: gId, uId: id});
            if (iGroupMember)
                continue;
            ++added
            await this.groupMember.create(
                {
                    uId: peerUser._id,
                    rId: gId,

                    userData: {
                        _id: peerUser._id,
                        userImage: peerUser.userImage,
                        fullName: peerUser.fullName,
                        fullNameEn: peerUser.fullNameEn,
                    },
                    gR: GroupRoleType.Member,
                }
            )
            await this.roomMemberService.create(
                {
                    uId: peerUser._id,
                    rId: gId,
                    lSMId: newMongoObjId().toString(),
                    rT: RoomType.GroupChat,
                    t: rM.t,
                    tEn: rM.tEn,
                    isOneSeen: false,
                    img: rM.img,
                }
            )
            await this.socketIoService.joinRoom({roomId: gId, usersIds: [id]})
            if (!isChannel) {
                let msgDto = getMsgDtoObj({
                    mT: MessageType.Info,
                    user: dto.myUser,
                    rId: gId,
                    att: {
                        adminName: dto.myUser.fullName,
                        targetId: peerUser._id,
                        targetName: peerUser.fullName,
                        action: MessageInfoType.AddGroupMember
                    },
                    content: peerUser.fullName + " Added BY " + dto.myUser.fullName,
                });
                this.messageChannelService.createMessage(msgDto, true).then()
            }
            // await this.notificationService.singleChatNotification(id, newMessage);

            // Add loyalty points for joining group
            try {
                await this.loyaltyPointsService.addPoints(peerUser._id, LoyaltyPointsAction.JOIN_GROUP);
            } catch (error) {
                console.error('Failed to add group join loyalty points:', error);
            }

        }
        await this.groupSetting.findByIdAndUpdate(gId, {
            $pullAll: {
                outUsers: dto.ids,
            },
        });
        return "Users successfully added to the group " + added
    }

    async checkGroupAdminMember(gId: string, myId: string) {
        let rM: IRoomMember = await this.middlewareService.isThereRoomMemberOrThrow(gId, myId)
        if (rM.rT != RoomType.GroupChat) throw new BadRequestException('you must perform this action on groups')
        let gM: IGroupMember = await this.groupMember.findOne({
            rId: gId,
            uId: myId
        })
        if (!gM) throw new BadRequestException("IGroupMember not exist for addMembersToGroup " + `group id ${gId}, user id ${myId}`)
        if (gM.gR == GroupRoleType.Member) throw new BadRequestException("You must be admin to perform")
        return rM
    }

    async changeGroupUserRole(dto: UpdateRoleDto) {
        await this.checkGroupAdminMember(dto.roomId, dto.myUser._id);
        let peerGM: IGroupMember = await this.groupMember.findOne({rId: dto.roomId, uId: dto.peerId})
        if (dto.myUser._id == dto.peerId) throw new BadRequestException("You cant change your role!")
        if (!peerGM) throw new BadRequestException("Room member for peer user not exist in the group!")
        if (peerGM.gR == GroupRoleType.SuperAdmin) throw new BadRequestException("You cant play with the group creator")
        await this._changeUserRoleTo(dto, peerGM, dto.role)
        return "success"
    }


    async kickGroupMember(dto: KickMembersDto) {
        await this.checkGroupAdminMember(dto.roomId, dto.myUser._id);
        let peerGM: IGroupMember = await this.groupMember.findOne(
            {
                rId: dto.roomId,
                uId: dto.peerId
            }
        )
        if (dto.myUser._id == dto.peerId) {
            throw new BadRequestException("You cant kick your self!")
        }
        if (!peerGM) {
            throw new BadRequestException("Room member for peer user not exist in the group!")
        }
        await this.socketIoService.kickGroupMember(dto.roomId.toString(), dto.peerId.toString());
        await this.groupMember.deleteOne({
            rId: dto.roomId,
            uId: dto.peerId
        });
        await this.roomMemberService.findOneAndDelete({
            rId: dto.roomId,
            uId: dto.peerId
        });
        await this.socketIoService.leaveRoom(dto.roomId.toString(), dto.peerId.toString());
        let msgDto = getMsgDtoObj({
            mT: MessageType.Info,
            user: dto.myUser,
            rId: dto.roomId,
            att: {
                adminName: dto.myUser.fullName,
                targetName: peerGM.userData.fullName,
                targetId: peerGM.uId,
                action: MessageInfoType.Kick
            },
            content: dto.myUser.fullName + " Kick " + peerGM.userData.fullName,
        });
        await this.messageChannelService.createMessage(msgDto, true).then()
        //leave the room from io
        await this.groupSetting.findByIdAndUpdate(dto.roomId, {
            $addToSet: {
                outUsers: dto.peerId
            },
        });
        //leave the room from io
        return "Successfully Kicked the user"
    }

    async getGroupMembers(myUser: IUser, dto: UsersSearchDto, roomId: string) {
        await this.middlewareService.isThereRoomMemberOrThrow(
            roomId,
            myUser._id,
        );
        let paginationParameters = new PaginationParameters({
                query: {
                    limit: 30,
                    page: 1,
                    sort: "-_id",
                    ...dto,
                },
            }
        ).get()
        if (paginationParameters[1].page <= 0) {
            paginationParameters[1].page = 1
        }
        if (paginationParameters[1].limit <= 0 || paginationParameters[1].limit >= 50) {
            paginationParameters[1].limit = 30
        }
        paginationParameters[0] = {
            rId: roomId,
            ...dto.getFilter("userData.fullNameEn")
        }
        return this.groupMember.paginate(paginationParameters);

    }

    async deleteGroup(dto: MongoRoomIdDto) {
        // Check if user is in the group
        let rM = await this.middlewareService.isThereRoomMemberOrThrow(dto.roomId, dto.myUser._id);
        if (rM.rT != RoomType.GroupChat) throw new BadRequestException("it must be GroupChat!");

        // Check if user is the group creator (SuperAdmin)
        let myGroupMember: IGroupMember = await this.groupMember.findOne({
            rId: dto.roomId,
            uId: dto.myUser._id
        });

        if (!myGroupMember) {
            throw new BadRequestException("You are not a member of this group!");
        }

        console.log('User role:', myGroupMember.gR, 'Expected:', GroupRoleType.SuperAdmin);
        console.log('User ID:', dto.myUser._id, 'Member User ID:', myGroupMember.uId);

        if (myGroupMember.gR !== GroupRoleType.SuperAdmin) {
            throw new BadRequestException("Only the group creator can delete the group!");
        }

        // Get group settings
        let groupSettings = await this.groupSetting.findById(dto.roomId);
        if (!groupSettings) {
            throw new BadRequestException("Group settings not found!");
        }

        // Notify all members that the group is being deleted
        let deleteGroupMsgDto = getMsgDtoObj({
            mT: MessageType.Info,
            user: dto.myUser,
            rId: dto.roomId,
            att: {
                adminName: dto.myUser.fullName,
                targetName: groupSettings.gName,
                targetId: dto.roomId,
                action: MessageInfoType.DeleteGroup
            },
            content: dto.myUser.fullName + ' deleted the group'
        });

        // Create the delete message before deleting everything
        await this.messageChannelService.createMessage(deleteGroupMsgDto, true);

        // Leave all members from socket rooms
        let allMembers = await this.groupMember.findAll({ rId: dto.roomId });
        for (let member of allMembers) {
            await this.socketIoService.leaveRoom(dto.roomId, member.uId);
        }

        // Delete all group data
        await this.roomMemberService.deleteMany({ rId: dto.roomId });
        await this.groupMember.deleteMany({ rId: dto.roomId });
        await this.groupSetting.findByRoomIdAndDelete(dto.roomId);

        // Delete all messages in the group
        await this.messageService.deleteWhere({ rId: dto.roomId });

        return "Group has been deleted successfully";
    }

    async leaveGroupChat(dto: MongoRoomIdDto) {
        let rM = await this.middlewareService.isThereRoomMember(dto.roomId, dto.myUser._id)
        if (rM == null) {
            return "You already left!"
        }
        let myGroupMember: IGroupMember = await this.groupMember.findOne({
            rId: dto.roomId,
            uId: dto.myUser._id
        })
        let membersCount = await this.groupMember.getMembersCount(dto.roomId)
        await this.socketIoService.leaveRoom(dto.roomId, dto.myUser._id);
        if (membersCount == 1) {
            // delete the  Group !
            await this.roomMemberService.deleteMany({
                rId: dto.roomId
            })
            await this.groupMember.deleteMany({
                rId: dto.roomId
            })
            await this.groupSetting.findByRoomIdAndDelete(dto.roomId)
            return "Group has been deleted";
        }
        if (myGroupMember.gR == GroupRoleType.SuperAdmin) {
            // we need to get old user and set him as super admin
            let nextSuperAdmin = await this.groupMember.findOne({
                $and: [
                    {rId: dto.roomId},
                    {uId: {$ne: dto.myUser._id}}
                ],
            }, null)
            let cDto = new UpdateRoleDto()
            cDto.myUser = dto.myUser;
            cDto.role = GroupRoleType.SuperAdmin
            cDto.roomId = dto.roomId
            cDto.peerId = nextSuperAdmin.uId
            await this._changeUserRoleTo(cDto, nextSuperAdmin, GroupRoleType.SuperAdmin)
        }
        let msgDto = getMsgDtoObj({
            mT: MessageType.Info,
            user: dto.myUser,
            rId: dto.roomId,
            att: {
                adminName: dto.myUser.fullName,
                targetName: dto.myUser.fullName,
                targetId: dto.myUser._id,
                action: MessageInfoType.Leave
            },
            content: dto.myUser.fullName + " Left the group "
        })
        this.messageChannelService.createMessage(msgDto, true).then()
        // delete group member
        // delete room member
        await this.groupMember.deleteOne({
            rId: dto.roomId,
            uId: dto.myUser._id
        });
        await this.roomMemberService.findOneAndDelete({
            rId: dto.roomId,
            uId: dto.myUser._id
        });
        //leave the room from io
        await this.groupSetting.findByIdAndUpdate(dto.roomId, {
            $addToSet: {
                outUsers: dto.myUser._id,
            },
        });

        return "left successfully";
    }

    async updateTitle(dto: MongoRoomIdDto, title: string) {
        let rM = await this.middlewareService.isThereRoomMemberOrThrow(dto.roomId, dto.myUser._id)
        if (rM.rT != RoomType.GroupChat) throw new BadRequestException("it must be group!")
        await this.roomMemberService.findByRoomIdAndUpdate(
            dto.roomId, {
                t: title,
                tEn:remove(title)
            }
        )
        let msgDto = getMsgDtoObj({
            mT: MessageType.Info,
            user: dto.myUser,
            rId: dto.roomId,
            att: {
                adminName: dto.myUser.fullName,
                targetName: title,
                targetId: dto.myUser._id,
                action: MessageInfoType.UpdateTitle
            },
            content: "Title updated to " + title + " BY " + dto.myUser.fullName
        })
        this.messageChannelService.createMessage(msgDto, true).then()
        await this.groupSetting.findByIdAndUpdate(dto.roomId, {
            gName: title
        })
        return "Room has been renamed successfully"
    }

    async updateImage(dto: MongoRoomIdDto, file: any) {
        let rM = await this.middlewareService.isThereRoomMemberOrThrow(dto.roomId, dto.myUser._id)
        if (rM.rT != RoomType.GroupChat) throw new BadRequestException("it must be group!")
        let keyImage = `${S3UploaderTypes.profileImage}-${uuidv4()}.jpg`;
        let url = await this.s3.putImageCropped(file.buffer, keyImage)
        await this.roomMemberService.findByRoomIdAndUpdate(dto.roomId, {img: url})
        let msgDto = getMsgDtoObj({
            mT: MessageType.Info,
            user: dto.myUser,
            rId: dto.roomId,
            att: {
                adminName: dto.myUser.fullName,
                targetName: url,
                targetId: dto.myUser._id,
                action: MessageInfoType.UpdateImage
            },
            content: "Photo updated BY " + dto.myUser.fullName,
        });
        this.messageChannelService.createMessage(msgDto, true).then()
        await this.groupSetting.findByIdAndUpdate(dto.roomId, {
            gImg: url
        })
        return url
    }

    async getMyGroupInfo(dto: MongoRoomIdDto) {
        let roomMember = await this.middlewareService.isThereRoomMember(dto.roomId, dto.myUser._id)
        if (roomMember == null) {
            //ima out from the group!
            return {
                isMeOut: true,
                membersCount: 0,
                myRole: GroupRoleType.Member,
                groupSettings: null,
                totalOnline: 0
            }
        }
        let settings = await this.groupSetting.findByIdOrThrow(dto.roomId, "+outUsers")
        if (!settings) throw new NotFoundException("get Group Settings with id" + dto.roomId + " not exist")
        let groupMembersCount = await this.groupMember.getMembersCount(dto.roomId);
        let myRole = GroupRoleType.Member;
        let groupMember: IGroupMember = await this.groupMember.findOne(
            {
                rId: dto.roomId,
                uId: dto.myUser._id,
            }
        );
        if (groupMember) {
            myRole = groupMember.gR;
        }
        let groupSettings: IGroupSettings = await this.groupSetting.findByIdOrThrow(
            dto.roomId,
        );

        return {
            isMeOut: false,
            membersCount: groupMembersCount,
            myRole: myRole,
            groupSettings: groupSettings,
            totalOnline: await this.socketIoService.getOnlineRoomId(dto.roomId)
        }
    }

    async getMyGroupStatus(dto: MongoRoomIdDto) {
        let roomMember = await this.middlewareService.isThereRoomMember(dto.roomId, dto.myUser._id)
        return {
            isMeOut: roomMember == null,
        }
    }

    async updateGroupExtraData(dto: MongoRoomIdDto, data: {}) {
        if (Object.keys(data).length == 0) throw new BadRequestException("object data in body  is required and not be empty")
        await this.middlewareService.isThereRoomMemberOrThrow(dto.roomId, dto.myUser._id)
        // Read current settings to detect transition to channel
        const settings = await this.groupSetting.findByIdOrThrow(dto.roomId);
        const wasChannel = settings && (settings as any).extraData && (settings as any).extraData['isChannel'] === true;
        await this.groupSetting.findByIdAndUpdate(dto.roomId, {
            extraData: data
        })

        const isChannel = (data as any)['isChannel'] === true;
        if (!wasChannel && isChannel) {
            // Emit a channel created info message so clients show correct banner
            const msgDto = getMsgDtoObj({
                mT: MessageType.Info,
                user: dto.myUser,
                rId: dto.roomId,
                att: {
                    adminName: dto.myUser.fullName,
                    targetName: settings.gName,
                    targetId: dto.roomId,
                    action: MessageInfoType.CreateChannel,
                },
                content: `Channel created by ${dto.myUser.fullName}`,
            });
            await this.messageChannelService.createMessage(msgDto, true);
            // Remove any previous 'CreateGroup' info messages so UI won't show 'Group created by'
            await this.messageService.deleteWhere({
                rId: dto.roomId,
                mT: MessageType.Info,
                'att.action': MessageInfoType.CreateGroup,
            } as any);
        }
        return "success"
    }

    async getGroupMessageInfo(dto: MessageStatusParamDto, x: DefaultPaginateParams) {
        let paginationParameters = new PaginationParameters({
                query: {
                    limit: x.getLimit(),
                    page: x.getPage(),
                    sort: "sAt dAt",
                    select: "-mId -rId -_id",
                    populate: {
                        path: 'uId',
                        select: "fullName fullNameEn userImage",
                    },
                    lean: true,
                },
            }).get()
        paginationParameters[0] = {
            rId: dto.roomId,
            mId: dto.messageId,
            uId: {$ne: dto.myUser._id}
        }
        if (dto.type == MessageStatusType.Seen) {
            paginationParameters[0]['sAt'] = {
                $ne: null
            }
            paginationParameters[0]['dAt'] = {
                $ne: null
            }
        } else {
            //deliver
            paginationParameters[0]['sAt'] = {
                $eq: null
            }
            paginationParameters[0]['dAt'] = {
                $ne: null
            }
        }
        let data = await this.groupMessageStatusService.paginate(paginationParameters)
        for (let d of data.docs) {
            d['userData'] = d['uId']
            delete d['uId']
        }

        return data
    }

    async updateDescription(dto: MongoRoomIdDto, description: string) {
        let rM = await this.middlewareService.isThereRoomMemberOrThrow(dto.roomId, dto.myUser._id)
        if (rM.rT != RoomType.GroupChat) throw new BadRequestException("it must be group!")
        await this.groupSetting.findByIdAndUpdate(dto.roomId, {
            desc: description
        })
        return "Description updated successfully"
    }

    /// ---private functions ------
    private async _changeUserRoleTo(dto: UpdateRoleDto, peerGM: IGroupMember, role: GroupRoleType) {
        let text = peerGM.userData.fullName
        if (role == GroupRoleType.Member) {
            text = text + " down to member by "
        } else {
            text = text + " promoted to admin by "
        }
        text = text + dto.myUser.fullName

        let msgDto = getMsgDtoObj({
            mT: MessageType.Info,
            user: dto.myUser,
            rId: peerGM.rId,
            att: {
                adminName: dto.myUser.fullName,
                targetName: peerGM.userData.fullName,
                targetId: peerGM.uId,
                action: role == GroupRoleType.Member ? MessageInfoType.DownMember : MessageInfoType.UpAdmin
            },
            content: text,
        });
        await this.groupMember.findOneAndUpdate({_id: peerGM._id}, {
            gR: role,
        });
        if (dto.role != peerGM.gR) {
            await this.messageChannelService.createMessage(msgDto, true)
        }
        return text
    }

    async getAvailableUsersToAdd(dto: Object, roomId: string, myId: string) {
        await this.checkGroupAdminMember(roomId, myId)
        let outUsers = []
        //get my bans
        let myBans = await this.userBan.getMyBlockTheyAndMe(myId)
        outUsers.push(myId)
        outUsers.push(...myBans)
        let groupMembers = await this.groupMember.findAll({rId: roomId}, "uId")
        outUsers.push(...groupMembers.map(value => value.uId.toString()))
        return this.userService.searchV2(dto, outUsers)
    }

    /**
     * Allow a user to join a channel (a special group where only admins can post).
     * This will create both a room member and a group member entries for the user.
     */
    async joinChannel(dto: MongoRoomIdDto) {
        // Validate group settings and channel flag
        let settings = await this.groupSetting.findByIdOrThrow(dto.roomId);
        const isChannel = settings && (settings as any).extraData && (settings as any).extraData['isChannel'] === true;
        if (!isChannel) throw new BadRequestException("This room is not a channel");

        // Check existing membership
        const existingMember = await this.groupMember.findOne({ rId: dto.roomId, uId: dto.myUser._id }, null);
        if (existingMember) {
            // Already joined, return full room model
            return this.channelService._getOneFullRoomModel({ roomId: dto.roomId, userId: dto.myUser._id });
        }

        // Create membership entries
        const me: IUser = await this.userService.findByIdOrThrow(dto.myUser._id, "fullName fullNameEn userImage");
        await this.groupMember.create({
            uId: me._id,
            rId: dto.roomId,
            userData: {
                _id: me._id,
                userImage: me.userImage,
                fullName: me.fullName,
                fullNameEn: me.fullNameEn,
            },
            gR: GroupRoleType.Member,
        });

        await this.roomMemberService.create({
            uId: me._id,
            rId: dto.roomId,
            lSMId: newMongoObjId().toString(),
            rT: RoomType.GroupChat,
            t: settings.gName,
            tEn: remove(settings.gName),
            img: settings.gImg,
            isOneSeen: false,
        });

        await this.socketIoService.joinRoom({ roomId: dto.roomId.toString(), usersIds: [dto.myUser._id.toString()] });
        await this.groupSetting.findByIdAndUpdate(dto.roomId, { $pull: { outUsers: dto.myUser._id } });

        return this.channelService._getOneFullRoomModel({ roomId: dto.roomId, userId: dto.myUser._id });
    }

    /**
     * Return a simple list of suggested channels with follower counts and join status.
     */
    async getSuggestedChannels(myUserId: string, limit: number = 20) {
        // Find channel settings
        const channels = await this.groupSetting.findAll({ "extraData.isChannel": true }, null, { sort: "-createdAt", limit });
        const results: any[] = [];
        for (const ch of channels) {
            const followers = await this.groupMember.getMembersCount(ch._id.toString());
            const isJoined = await this.roomMemberService.findOne({ rId: ch._id, uId: myUserId }) != null;
            results.push({
                roomId: ch._id,
                title: ch.gName,
                image: ch.gImg,
                followers,
                isJoined,
            });
        }
        // sort by followers desc
        results.sort((a, b) => (b.followers || 0) - (a.followers || 0));
        return { docs: results };
    }
}