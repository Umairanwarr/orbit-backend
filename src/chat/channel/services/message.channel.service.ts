/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {BadRequestException, ForbiddenException, Injectable} from "@nestjs/common";
import {ConfigService} from "@nestjs/config";
import {RoomMemberService} from "../../room_member/room_member.service";
import {MessageService} from "../../message/message.service";
import {UserService} from "../../../api/user_modules/user/user.service";
import {UserBanService} from "../../../api/user_modules/user_ban/user_ban.service";
import {GroupSettingsService} from "../../group_settings/group_settings.service";
import {BroadcastSettingsService} from "../../broadcast_settings/broadcast_settings.service";
import {GroupMemberService} from "../../group_member/group_member.service";
import {BroadcastMemberService} from "../../broadcast_member/broadcast_member.service";
import {SocketIoService} from "../../socket_io/socket_io.service";
import {RoomMiddlewareService} from "../../room_middleware/room_middleware.service";
import {FileUploaderService} from "../../../common/file_uploader/file_uploader.service";
import {newMongoObjId} from "../../../core/utils/utils";
import {IRoomMember} from "../../room_member/entities/room_member.entity";
import {SendMessageDto} from "../dto/send.message.dto";
import {
    DeleteMessageType,
    MessageType,
    RoomType,
    SocketEventsType,
    GroupRoleType,
} from "../../../core/utils/enums";
import {GroupMessageStatusService} from "../../group_message_status/group_message_status.service";
import {NotificationEmitterService} from "../../../common/notification_emitter/notification_emitter.service";
import {AppConfigService} from "../../../api/app_config/app_config.service";
import {IGroupMember} from "../../group_member/entities/group_member.entity";
import {IMessage} from "../../message/entities/message.entity";
import {DeleteMessageDto} from "../dto/delete.message.dto";
import {NotificationReplyDto} from "../dto/notification.reply.dto";
import {MessagesSearchDto} from "../../message/dto/messages_search_dto";
import {jsonDecoder} from "../../../core/utils/app.validator";
import {CreateS3UploaderDto} from "../../../common/file_uploader/create-s3_uploader.dto";
import {getMsgDtoObj} from "../chat.helper";
import imageSize from "image-size";
import {NotificationEmitterChannelService} from "./notification_emitter_channel.service";
import {RoomIdAndMsgIdDto} from "../../../core/common/dto/room.id.and.msg.id.dto";
import {MongoRoomIdDto} from "../../../core/common/dto/mongo.room.id.dto";
import { OrderRoomSettingsService } from "../../order_room_settings/single_room_settings.service";
import { MarketplaceListingsService } from "../../../api/marketplace/marketplace_listings.service";
import crypto from "crypto";
import * as Buffer from "buffer";
const objectIdRegExp = /[a-f\d]{24}/gi;

@Injectable()
export class MessageChannelService {
    constructor(
        private readonly roomMemberService: RoomMemberService,
        private readonly messageService: MessageService,
        private readonly userService: UserService,
        private readonly s3: FileUploaderService,
        private readonly config: ConfigService,
        private readonly socket: SocketIoService,
        private readonly middlewareService: RoomMiddlewareService,
        private readonly notificationService: NotificationEmitterChannelService,
        private readonly appConfig: AppConfigService,
        private readonly groupMember: GroupMemberService,
        private readonly broadcastMember: BroadcastMemberService,
        private readonly groupSetting: GroupSettingsService,
        private readonly broadcastSetting: BroadcastSettingsService,
        private readonly groupMessageStatusService: GroupMessageStatusService,
        private readonly userBan: UserBanService,
        private readonly orderRoomSettingsService: OrderRoomSettingsService,
        private readonly marketplaceListingsService: MarketplaceListingsService,
    ) {
    }

    private _marketplaceListingIdFromOrderId(orderId: any): string {
        const v = (orderId ?? '').toString().trim();
        if (!v.startsWith('mp_')) return '';
        const parts = v.split('_');
        if (parts.length < 2) return '';
        return (parts[1] ?? '').toString().trim();
    }

  // ===== Polls =====
  async voteInPoll(dto: RoomIdAndMsgIdDto, optionIds: string[]) {
    await this.middlewareService.isThereRoomMemberOrThrow(
      dto.roomId,
      dto.myUser._id,
    );
    if (!optionIds || optionIds.length === 0) {
      throw new BadRequestException('optionIds required');
    }
    const chosen = optionIds[0]; // single-choice for now
    const msg = await this.messageService.getByIdOrFail(dto.messageId);
    if (!msg) throw new BadRequestException('Message not found');
    if (msg.mT !== MessageType.Custom) {
      throw new BadRequestException('Not a poll message');
    }
    const baseAtt: any = msg.msgAtt || {};
    const pollAtt: any = baseAtt && baseAtt.data ? baseAtt.data : baseAtt;
    if (!pollAtt || pollAtt.type !== 'poll') {
      throw new BadRequestException('Not a poll attachment');
    }
    const options: any[] = pollAtt.options || [];
    if (!options.find((o) => o.id === chosen)) {
      throw new BadRequestException('Invalid option id');
    }
    // votes: { [optionId]: string[] }
    const votes = pollAtt.votes || {};
    const userIdStr = dto.myUser._id.toString();
    // remove user from all options
    for (const key of Object.keys(votes)) {
      const arr: string[] = votes[key] || [];
      const idx = arr.findIndex((u) => u === userIdStr);
      if (idx !== -1) {
        arr.splice(idx, 1);
      }
      votes[key] = arr;
    }
    // add to chosen
    const arr = votes[chosen] || [];
    if (!arr.includes(userIdStr)) arr.push(userIdStr);
    votes[chosen] = arr;

    pollAtt.votes = votes;
    const newMsgAtt = baseAtt && baseAtt.data ? { ...baseAtt, data: pollAtt } : pollAtt;
    await this.messageService.findByIdAndUpdate(dto.messageId, {
      msgAtt: newMsgAtt,
      updatedAt: new Date(),
    });
    const updated = await this.messageService.getByIdOrFail(dto.messageId);
    this.socket.io
      .to(dto.roomId.toString())
      .emit(SocketEventsType.v1OnUpdateMessage, JSON.stringify(updated));
    return { ok: true };
  }

  async getPollResults(dto: RoomIdAndMsgIdDto) {
    await this.middlewareService.isThereRoomMemberOrThrow(
      dto.roomId,
      dto.myUser._id,
    );
    const msg = await this.messageService.getByIdOrFail(dto.messageId);
    if (!msg) throw new BadRequestException('Message not found');
    if (msg.mT !== MessageType.Custom) {
      throw new BadRequestException('Not a poll message');
    }
    const baseAtt: any = msg.msgAtt || {};
    const pollAtt: any = baseAtt && baseAtt.data ? baseAtt.data : baseAtt;
    if (!pollAtt || pollAtt.type !== 'poll') {
      throw new BadRequestException('Not a poll attachment');
    }
    const votes = pollAtt.votes || {};
    const options: any[] = pollAtt.options || [];
    const allVoterIds: string[] = Array.from(new Set(Object.values(votes).flat().map((x: any) => x.toString())));
    let profilesById: Record<string, any> = {};
    if (allVoterIds.length > 0) {
      try {
        const profiles = await this.userService.findByIds(allVoterIds, 'fullName userImage');
        for (const p of profiles) {
          profilesById[p._id.toString()] = { id: p._id.toString(), name: p.fullName, image: p.userImage };
        }
      } catch (_) {}
    }
    const results = options.map((o) => ({
      id: o.id,
      text: o.text,
      voters: (votes[o.id] || []).map((x: any) => x.toString()),
      voterProfiles: (votes[o.id] || []).map((x: any) => profilesById[x.toString()]).filter(Boolean),
      count: (votes[o.id] || []).length,
    }));
    return {
      question: pollAtt.question,
      allowMulti: !!pollAtt.allowMulti,
      options: results,
    };
  }

  async respondToOffer(dto: RoomIdAndMsgIdDto, status: string) {
    await this.middlewareService.isThereRoomMemberOrThrow(
      dto.roomId,
      dto.myUser._id,
    );

    // Disallow offer actions in closed order rooms
    try {
      const settings: any = await this.orderRoomSettingsService.findById(dto.roomId);
      if (settings && settings.closedAt) {
        throw new BadRequestException('This chat is closed');
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
    }

    // Also disallow offers for removed marketplace listings (even if room not marked closed yet)
    try {
      const rM: any = await this.roomMemberService.findOne(
        { rId: dto.roomId, uId: dto.myUser._id },
        'rT orderId',
      );
      if (rM && rM.rT === RoomType.Order) {
        const listingId = this._marketplaceListingIdFromOrderId(rM.orderId);
        if (listingId) {
          await this.marketplaceListingsService.getByIdPublic(listingId);
        }
      }
    } catch (_) {
      throw new BadRequestException('This listing is no longer available');
    }

    const s = (status ?? '').toString().trim().toLowerCase();
    if (s !== 'accepted' && s !== 'declined' && s !== 'countered') {
      throw new BadRequestException('Invalid status');
    }
    const msg = await this.messageService.getByIdOrFail(dto.messageId);
    if (!msg) throw new BadRequestException('Message not found');
    if (msg.mT !== MessageType.Custom) {
      throw new BadRequestException('Not an offer message');
    }
    const senderId = msg.sId?.toString();
    const myId = dto.myUser._id.toString();
    if (senderId && senderId === myId) {
      throw new ForbiddenException('You cannot respond to your own offer');
    }
    const baseAtt: any = msg.msgAtt || {};
    const offerAtt: any = baseAtt && baseAtt.data ? baseAtt.data : baseAtt;
    if (!offerAtt || offerAtt.type !== 'marketplace_offer') {
      throw new BadRequestException('Not a marketplace offer');
    }
    const currentStatus = (offerAtt.status ?? '').toString().trim().toLowerCase();
    if (currentStatus === 'accepted' || currentStatus === 'declined') {
      throw new BadRequestException('Offer already finalized');
    }

    offerAtt.status = s;
    offerAtt.respondedBy = myId;
    offerAtt.respondedAt = new Date().toISOString();

    const newMsgAtt = baseAtt && baseAtt.data ? { ...baseAtt, data: offerAtt } : offerAtt;
    await this.messageService.findByIdAndUpdate(dto.messageId, {
      msgAtt: newMsgAtt,
      updatedAt: new Date(),
    });
    const updated = await this.messageService.getByIdOrFail(dto.messageId);
    this.socket.io
      .to(dto.roomId.toString())
      .emit(SocketEventsType.v1OnUpdateMessage, JSON.stringify(updated));
    return { ok: true };
  }

    async createMessage(dto: SendMessageDto, isSilent: boolean = false,) {
        console.log(`[createMessage] START room=${dto._roomId} localId=${dto.localId} type=${dto.messageType}`);
        let rM: IRoomMember = await this.middlewareService.isThereRoomMember(
            dto._roomId,
            dto.myUser._id,
            "rT t bId isOneSeen orderId"
        );
        if (!rM) {
            console.log(`[createMessage] ERROR: No room found ${dto._roomId}`);
            throw new ForbiddenException('No room found ' + dto._roomId);
        }
        // Convert string to boolean and handle the isOneSeen logic
        let messageIsOneSeen: boolean;
        if (dto.isOneSeen !== undefined && dto.isOneSeen !== null) {
            // If explicitly set in the message, use that value (convert string to boolean)
            messageIsOneSeen = typeof dto.isOneSeen === 'string' ? dto.isOneSeen === "true" : dto.isOneSeen;
        } else {
            // If not explicitly set, use the room member's setting
            messageIsOneSeen = rM.isOneSeen ?? false;
        }
        dto.isOneSeen = messageIsOneSeen as any;
        let ban = await this.userBan.getBan(rM.uId, rM.pId)
        if (ban) {
            console.log(`[createMessage] ERROR: User banned`);
            throw new ForbiddenException('You dont have access ' + rM.rT)
        }
        let isSingle = rM.rT == RoomType.Single
        let isOrder = rM.rT == RoomType.Order
        let isGroup = rM.rT == RoomType.GroupChat
        let isBroadcast = rM.rT == RoomType.Broadcast

        // Disallow sending messages in closed order rooms
        if (isOrder) {
          try {
            const settings: any = await this.orderRoomSettingsService.findById(dto._roomId);
            if (settings && settings.closedAt) {
              throw new ForbiddenException('This chat is closed');
            }
          } catch (e) {
            if (e instanceof ForbiddenException) throw e;
          }

          // Also disallow messaging for removed marketplace listings (even if room not marked closed yet)
          try {
            const listingId = this._marketplaceListingIdFromOrderId((rM as any).orderId);
            if (listingId) {
              await this.marketplaceListingsService.getByIdPublic(listingId);
            }
          } catch (_) {
            throw new ForbiddenException('This listing is no longer available');
          }
        }
        // Enforce group posting permissions based on settings.extraData
        if (isGroup) {
            try {
                const settings = await this.groupSetting.findById(rM.rId);
                const extra: any = settings && (settings as any)['extraData'] ? (settings as any)['extraData'] : {};
                const isChannel = extra['isChannel'] === true;
                const sendPolicy: string = extra['sendPolicy'] || 'all'; // 'all' | 'admins'
                const mutedUsers: string[] = Array.isArray(extra['mutedUsers'])
                    ? (extra['mutedUsers'] as any[]).map((x) => x.toString())
                    : [];

                const myMember = await this.groupMember.findOne({ rId: rM.rId, uId: dto.myUser._id });
                const isAdmin = !!myMember && (myMember.gR === GroupRoleType.Admin || myMember.gR === GroupRoleType.SuperAdmin);

                // Channels: only admins can post
                if (isChannel && !isAdmin) {
                    throw new ForbiddenException('Only channel admins can post');
                }
                // Group policy: only admins can send
                if (sendPolicy === 'admins' && !isAdmin) {
                    throw new ForbiddenException('Only admins can send messages in this group');
                }
                // Per-user mute: block muted non-admins
                if (!isAdmin && mutedUsers.includes(dto.myUser._id.toString())) {
                    throw new ForbiddenException('You are not allowed to send messages in this group');
                }
            } catch (e) {
                if (e instanceof ForbiddenException) throw e;
                // ignore other errors and continue
            }
        }
        console.log(`[createMessage] Checking duplicate localId=${dto.localId}`);
        let isExits = await this.messageService.isMessageExist(dto.localId);
        if (isExits) {
            console.log(`[createMessage] ERROR: Message with localId ${dto.localId} already exists!`);
            throw new ForbiddenException('Message already in database ForbiddenException');
        }
        console.log(`[createMessage] No duplicate found, proceeding`);
        if (dto.replyToLocalId) {
            let rToMsg: IMessage | null = await this.messageService.getByLocalId(dto.replyToLocalId)
            if (!rToMsg) throw new ForbiddenException('dto.replyToId msg not exist in db ' + dto.replyToLocalId)
            //todo s3 support
            dto._replyTo = JSON.stringify(rToMsg)
        }
        dto._messageAttachment = await this.getMessageAttachment(dto);
        if (dto.isText()) {
            dto.mentions = dto.content.match(objectIdRegExp) ?? []
        }
        if (dto.forwardLocalId) dto = await this.getForwardMessageNewDto(dto);

        await this.middlewareService.unDeleteAllRoomMembers(dto._roomId);
        if (isSingle || isOrder) {
            let peer: IRoomMember = await this.roomMemberService.findOne(
                {
                    rId: dto._roomId,
                    rT: rM.rT,
                    uId: {$ne: dto.myUser._id},
                }
            );
            if (!peer) throw new BadRequestException('Cant find the peer user in the chat data is');
            let isThereBan = await this.userBan.getBan(dto.myUser._id, peer.uId)
            if (isThereBan) throw new ForbiddenException("You dont have access");
            let newMessage = await this.messageService.create(dto);
            console.log(`[createMessage] SUCCESS: Created message id=${newMessage._id} in room=${dto._roomId}`);
            // let newMsg = await this.s3.getSignedMessage(newMessage);
            this.socket.io
                .to(dto._roomId.toString())
                .emit(SocketEventsType.v1OnNewMessage, JSON.stringify(newMessage));
            console.log(`[createMessage] Socket event emitted to room ${dto._roomId}`);
            if (!isSilent) await this.notificationService.singleChatNotification(peer.uId, newMessage);
            return newMessage;
        } else if (isGroup) {
            console.log(`[createMessage] Creating GROUP message in room=${dto._roomId}`);
            let createdMessage = await this.messageService.create(dto);
            console.log(`[createMessage] GROUP message created id=${createdMessage._id}`);
            await this._createStatusForGroupChat(dto._roomId, createdMessage._id);
            // let newMsg = await this.s3.getSignedMessage(createdMessage);
            this.socket.io
                .to(dto._roomId.toString())
                .emit(SocketEventsType.v1OnNewMessage, JSON.stringify(createdMessage));
            console.log(`[createMessage] GROUP socket event emitted to room ${dto._roomId}`);
            if (!isSilent) {
                this.notificationService
                    .groupChatNotification(createdMessage, rM.t)
                    .then();
            }
            return createdMessage;
        } else if (isBroadcast) {
            let myMsg: IMessage;
            let messages: IMessage[] = await this.saveBroadcastMessages(dto);

            for (let msg of messages) {
                // msg = await this.s3.getSignedMessage(msg);
                if (msg.rId == dto._roomId) {
                    myMsg = msg as IMessage;
                }
                this.socket.io.to(msg.rId.toString()).emit(SocketEventsType.v1OnNewMessage, JSON.stringify(msg));
            }
            if (!isSilent) {
                this.notificationService.broadcastNotification(myMsg).then();
            }

            return myMsg;
        }
        throw new BadRequestException(
            'Message type ' + dto.messageType + ' not supported ',
        );
    }

    async deleteRoomMessage(dto: DeleteMessageDto) {
        await this.middlewareService.isThereRoomMemberOrThrow(dto.roomId, dto.myUser._id);
        if (dto.type == DeleteMessageType.me) {
            await this.messageService.deleteMessageFromMe(
                dto.myUser._id,
                dto.messageId,
            );

            let msg = await this.messageService.findOne({
                rId: dto.roomId,
                dF: {$ne: dto.myUser._id},
            });
            if (!msg) {
                // delete the room
                await this.roomMemberService.findOneAndUpdate({
                    rId: dto.roomId,
                    uId: dto.myUser._id,
                }, {isD: true,});
            }
            //todo trans
            return "Message has been deleted from you";
        } else {
            // check in me the sender
            await this.messageService.isMeMessageSenderOrThrow(
                dto.myUser._id,
                dto.messageId,
            );
            let [m] = await Promise.all([this.messageService.getByIdOrFail(dto.messageId)]);
            if (m.sId != dto.myUser._id) {
                throw new ForbiddenException(
                    'You dont have access to delete this message',
                );
            }

            // Check if message is within 24 hours for "Delete from all" (86400000 milliseconds)
            const messageCreatedAt = new Date(m.createdAt).getTime();
            const now = Date.now();
            const twentyFourHoursInMs = 86400000;
            if (now - messageCreatedAt > twentyFourHoursInMs) {
                throw new ForbiddenException("Messages can only be deleted from all within 24 hours of being sent");
            }

            try {
                const msgAtt: any = (m as any)?.msgAtt;
                const url = msgAtt?.url;
                const thumbUrl = msgAtt?.thumbUrl;
                const thumbImageUrl = msgAtt?.thumbImage?.url;
                if (typeof url === 'string' && url) {
                    await this.s3.deleteByUrl(url);
                }
                if (typeof thumbUrl === 'string' && thumbUrl) {
                    await this.s3.deleteByUrl(thumbUrl);
                }
                if (typeof thumbImageUrl === 'string' && thumbImageUrl) {
                    await this.s3.deleteByUrl(thumbImageUrl);
                }
            } catch (_) {
            }

            let x: IMessage = await this.messageService.findByIdAndUpdate(dto.messageId, {
                dltAt: new Date(),
            });
            this.socket.io
                .to(x.rId.toString())
                .emit(SocketEventsType.v1OnDeleteMessageFromAll, JSON.stringify(x));
            //todo trans
            return "Message has been deleted from all";
        }
    }


    async getRoomMessages(myId: string, roomId: string, dto: MessagesSearchDto) {
        const isThere = await this.middlewareService.isThereRoomMember(roomId, myId);
        if (!isThere) {
            // Allow read-only access for public channels (groups marked as channel)
            try {
                const settings = await this.groupSetting.findById(roomId);
                const isChannel = settings && (settings as any)['extraData'] && (settings as any)['extraData']['isChannel'] === true;
                if (isChannel) {
                    const res = await this.messageService.findAllMessagesAggregation(
                        newMongoObjId(myId),
                        newMongoObjId(roomId),
                        dto,
                    );
                    return { docs: res };
                }
            } catch (e) {
                // fall through to empty docs
            }
            return { docs: [] };
        }
        const res = await this.messageService.findAllMessagesAggregation(newMongoObjId(myId), newMongoObjId(roomId), dto);
        return { docs: res };
    }

    async pinRoomMessage(dto: RoomIdAndMsgIdDto) {
        const rM: IRoomMember = await this.middlewareService.isThereRoomMemberOrThrow(
            dto.roomId,
            dto.myUser._id,
        );

        const isGroup = rM.rT == RoomType.GroupChat;
        if (isGroup) {
            const member: IGroupMember | null = await this.groupMember.findOne({
                rId: rM.rId,
                uId: dto.myUser._id,
            });
            if (!member || (member.gR !== GroupRoleType.Admin && member.gR !== GroupRoleType.SuperAdmin)) {
                throw new ForbiddenException("Only group admins can pin messages");
            }
        }

        const msg = await this.messageService.findById(dto.messageId);
        if (!msg) throw new BadRequestException("message not exists!");
        if (msg.rId.toString() != dto.roomId) throw new BadRequestException("message not exists in this room!");

        // Unpin any existing pinned message in this room
        await this.messageService.updateMany(
            {
                rId: dto.roomId,
                isPinned: true,
            },
            {
                $set: {
                    isPinned: false,
                    pinnedAt: null,
                    pinnedBy: null,
                },
            },
        );

        await this.messageService.findByIdAndUpdate(dto.messageId, {
            isPinned: true,
            pinnedAt: new Date(),
            pinnedBy: dto.myUser._id,
        });
        const pinned = await this.messageService.getByIdOrFail(dto.messageId);

        this.socket.io
            .to(dto.roomId.toString())
            .emit('chat_message_pinned', {
                roomId: dto.roomId.toString(),
                message: pinned,
            });

        return pinned;
    }

    async unpinRoomMessage(dto: RoomIdAndMsgIdDto) {
        const rM: IRoomMember = await this.middlewareService.isThereRoomMemberOrThrow(
            dto.roomId,
            dto.myUser._id,
        );

        const isGroup = rM.rT == RoomType.GroupChat;
        if (isGroup) {
            const member: IGroupMember | null = await this.groupMember.findOne({
                rId: rM.rId,
                uId: dto.myUser._id,
            });
            if (!member || (member.gR !== GroupRoleType.Admin && member.gR !== GroupRoleType.SuperAdmin)) {
                throw new ForbiddenException("Only group admins can unpin messages");
            }
        }

        const msg = await this.messageService.findById(dto.messageId);
        if (!msg) throw new BadRequestException("message not exists!");
        if (msg.rId.toString() != dto.roomId) throw new BadRequestException("message not exists in this room!");

        await this.messageService.findByIdAndUpdate(dto.messageId, {
            isPinned: false,
            pinnedAt: null,
            pinnedBy: null,
        });

        this.socket.io
            .to(dto.roomId.toString())
            .emit('chat_message_unpinned', {
                roomId: dto.roomId.toString(),
                messageId: dto.messageId.toString(),
            });

        return "Done";
    }

    async getPinnedRoomMessage(myId: string, roomId: string) {
        const isThere = await this.middlewareService.isThereRoomMember(roomId, myId);
        if (!isThere) {
            // Allow read-only access for public channels (groups marked as channel)
            try {
                const settings = await this.groupSetting.findById(roomId);
                const isChannel = settings && (settings as any)['extraData'] && (settings as any)['extraData']['isChannel'] === true;
                if (!isChannel) {
                    return null;
                }
            } catch (e) {
                return null;
            }
        }

        const pinned = await this.messageService.findOne({
            rId: roomId,
            isPinned: true,
            dltAt: null,
        });
        return pinned;
    }

//////////////////////////////////////////////////////////////////////////////////////utils//////////////////////////////////////////
    private sha256FromBuffer(buffer: Buffer) {
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }
    private async getMessageAttachment(dto: SendMessageDto) {
        if (dto.isInfo()) {
            if (!dto._messageAttachment) throw new BadRequestException("for isInfo message we must include _messageAttachment")
            return dto._messageAttachment;
        }
        if (dto.isText() || dto.forwardLocalId) {
            return null;
        }

        if (dto.isCustom()) {
            return jsonDecoder(dto.attachment)
        }

        let uploaderDto = new CreateS3UploaderDto();
        uploaderDto.myUser = dto.myUser;
        if (!dto.isLocation()) {
            uploaderDto.mediaBuffer = dto._mediaFile.buffer;
            uploaderDto.fileName = dto._mediaFile.originalname;
        }

        if (dto.isImage()) {
            let imgData = await this._getImageData(dto._mediaFile.buffer);
            let key = await this.s3.uploadChatMedia(uploaderDto);
            let blurHash = null
            if (dto.attachment) {
                blurHash = jsonDecoder(dto.attachment)['blurHash'];
            }

            return {
                url: key,
                fileSize: dto._mediaFile.size,
                width: imgData.width,
                height: imgData.height,
                blurHash: blurHash,
                orientation: imgData.orientation,
                mimeType: dto._mediaFile.mimetype,
                name: dto._mediaFile.originalname,
                fileHash: this.sha256FromBuffer(dto._mediaFile.buffer),
            };
        }

        if (dto.isFile()) {
            let key = await this.s3.uploadChatMedia(uploaderDto);
            return {
                url: key,
                fileSize: dto._mediaFile.size,
                mimeType: dto._mediaFile.mimetype,
                name: dto._mediaFile.originalname,
                fileHash: this.sha256FromBuffer(dto._mediaFile.buffer),
            };
        }

        if (dto.isVoice()) {
            let dCodedAtt = jsonDecoder(dto.attachment)
            if (!dCodedAtt['duration']) throw new BadRequestException("Voice duration in milli second is required in attachment json")
            let duration = dCodedAtt['duration']
            let key = await this.s3.uploadChatMedia(uploaderDto);

            return {
                url: key,
                duration: duration,
                fileSize: dto._mediaFile.size,
                mimeType: dto._mediaFile.mimetype,
                name: dto._mediaFile.originalname,
                fileHash: this.sha256FromBuffer(dto._mediaFile.buffer),
            };
        }

        if (dto.isVideo()) {
            let mediaKey = await this.s3.uploadChatMedia(uploaderDto);
            let thumbImageData = null
            let dCodedAtt = jsonDecoder(dto.attachment)
            if (dto._secondMediaFile) {
                let imgData = await this._getImageData(dto._secondMediaFile.buffer);

                uploaderDto.mediaBuffer = dto._secondMediaFile.buffer;
                thumbImageData = {}
                thumbImageData['mimeType'] = dto._secondMediaFile.mimetype;
                thumbImageData['url'] = await this.s3.uploadChatMedia(uploaderDto);
                thumbImageData['fileSize'] = dto._secondMediaFile.size;
                thumbImageData['orientation'] = imgData.orientation;
                thumbImageData['width'] = imgData.width;
                thumbImageData['blurHash'] = dCodedAtt['thumbImage']['blurHash'] ?? null;
                thumbImageData['height'] = imgData.height;
                thumbImageData['name'] = dto._secondMediaFile.originalname;
                thumbImageData['fileHash']= this.sha256FromBuffer(dto._secondMediaFile.buffer)
            }

            // if (!dCodedAtt['duration']) throw new BadRequestException("duration must be in integer millisecond")

            return {
                url: mediaKey,
                duration: dCodedAtt['duration'] ?? null,
                thumbImage: thumbImageData,
                fileSize: dto._mediaFile.size,
                mimeType: dto._mediaFile.mimetype,
                name: dto._mediaFile.originalname,
                fileHash: this.sha256FromBuffer(dto._mediaFile.buffer),
            };
        }

        if (dto.isLocation()) {
            let att = jsonDecoder(dto.attachment)
            if (!att['lat']) throw new BadRequestException("lat is required as String")
            if (!att['long']) throw new BadRequestException("long is required as String")
            if (!att['linkPreviewData']) throw new BadRequestException("linkPreviewData is required as {}")
            if (!att['linkPreviewData']['title']) throw new BadRequestException("linkPreviewData title is required as string")
            if (!att['linkPreviewData']['description']) throw new BadRequestException("linkPreviewData description is required as string")
            // const apiKey = this.config.getOrThrow('mapsApiKey')
            // let data = await this.httpService.axiosRef.get(
            //     `https://maps.googleapis.com/maps/api/staticmap?center=${att['lat']},${att['long']}&zoom=15&size=600x400&key=${apiKey}`,
            //     {responseType: "arraybuffer"}
            // );
            // uploaderDto.mediaBuffer = data.data;
            // let key = await this.s3.uploadChatMedia(uploaderDto);
            // att['linkPreviewData']['image'] = {
            //     url: key,
            //     width: 600,
            //     height: 400,
            //     fileSize: 50 * 1024,
            //     mimeType: "image/png",
            //     name: att['lat'] + ".png"
            // };
            return att
        }

        throw new BadRequestException(+dto.messageType + ' not supported');
    }

    private async getForwardMessageNewDto(dto: SendMessageDto) {
        // Check if this is a cross-room forwarded message (starts with "forwarded_")
        if (dto.forwardLocalId && dto.forwardLocalId.startsWith("forwarded_")) {
            // For cross-room forwarded messages, don't try to look up the original message
            // The content and attachments are already copied in the client
            dto._replyTo = undefined;
            dto.replyToLocalId = undefined;
            return dto;
        }
        
        let fToMsg: any = await this.messageService.getByLocalId(dto.forwardLocalId);
        if (!fToMsg) throw new ForbiddenException("cant find the forwarded message id " + dto.forwardLocalId)
        dto._messageAttachment = fToMsg.msgAtt;
        dto.content = fToMsg.c;
        dto.messageType = fToMsg.mT;
        dto._replyTo = undefined;
        dto.replyToLocalId = undefined
        return dto;
    }

    private async saveBroadcastMessages(dto: SendMessageDto) {
        let broadcastId = dto._roomId;

        let broadcastUsers = await this.broadcastMember.findAll(
            {
                bId: broadcastId
            },
            'rId uId userData'
        );
        let messagesToCreate: SendMessageDto[] = []
        for (let bUser of broadcastUsers) {
            let msgDto = getMsgDtoObj({
                _id: newMongoObjId().toString(),
                mT: dto.messageType,
                att: dto._messageAttachment,
                rId: bUser.rId,
                peerData: bUser.userData,
                user: dto.myUser,
                content: dto.content,
                isEncrypted: dto.isEncrypted
            })
            messagesToCreate.push(msgDto)
        }
        let parentBroadcastMsgId = newMongoObjId();
        // doing this step to change the order or messages
        for (let m of messagesToCreate) {
            m._pBId = parentBroadcastMsgId.toString();
        }
        let myMsgDto = getMsgDtoObj({
            _id: parentBroadcastMsgId.toString(),
            mT: dto.messageType,
            att: dto._messageAttachment,
            rId: broadcastId,
            user: dto.myUser,
            localId: dto.localId,
            content: dto.content,
            isEncrypted: dto.isEncrypted
        })
        messagesToCreate.push(myMsgDto)
        return await this.messageService.createMany(messagesToCreate);
    }


    private async _getImageData(buffer: Buffer) {
        let imgWidth = 1
        let imgHeight = 1
        let imgOrientation = 1
        try {
            let imgData =   imageSize(buffer);
            imgWidth = imgData.width ?? 1;
            imgHeight = imgData.height ?? 1;
            imgOrientation = imgData.orientation ?? 1;
        } catch (err) {

        }
        return {
            width: imgWidth,
            height: imgHeight,
            orientation: imgOrientation
        }
    }

    private async _createStatusForGroupChat(_roomId: string, mId: string) {
        let members: IGroupMember[] = await this.groupMember.findAll({
            rId: _roomId,
        }, "uId")
        await this.groupMessageStatusService.createMany(members.map(value => {
            return {
                mId: mId,
                rId: _roomId,
                uId: value.uId
            }
        }));
    }

    async starRoomMessage(dto: RoomIdAndMsgIdDto) {
        await this.middlewareService.isThereRoomMemberOrThrow(dto.roomId, dto.myUser._id);
        let msg = await this.messageService.findById(dto.messageId)
        if (!msg) throw new BadRequestException("message not exists!")
        if (msg.rId.toString() != dto.roomId) throw new BadRequestException("message not exists in this room!")
        await this.messageService.findByIdAndUpdate(dto.messageId, {
            $addToSet: {stars: newMongoObjId(dto.myUser._id)}
        })
        return "Done"
    }

    async unStarRoomMessage(dto: RoomIdAndMsgIdDto) {
        await this.middlewareService.isThereRoomMemberOrThrow(dto.roomId, dto.myUser._id);
        let msg = await this.messageService.findById(dto.messageId)
        if (!msg) throw new BadRequestException("message not exists!")
        if (msg.rId.toString() != dto.roomId) throw new BadRequestException("message not exists in this room!")
        await this.messageService.findByIdAndUpdate(dto.messageId, {
            $pull: {stars: newMongoObjId(dto.myUser._id)}
        })
        return "Done"
    }

    async getMyAllStarMessages(dto: MongoRoomIdDto) {
        await this.middlewareService.isThereRoomMemberOrThrow(dto.roomId, dto.myUser._id);
        let res = await this.messageService.findAll({
            rId: dto.roomId,
            dF: {$ne: newMongoObjId(dto.myUser._id)},
            stars: newMongoObjId(dto.myUser._id),
        }, {lean: true, limit: 150, sort: "-_id"})
        for (let i of res) {
            i['isStared'] = true
        }
        return {docs: res}
    }

    async oneSeeThisMessage(dto: RoomIdAndMsgIdDto) {
        await this.middlewareService.isThereRoomMemberOrThrow(
            dto.roomId,
            dto.myUser._id,
        );
        let msg: IMessage = await this.messageService.getByIdOrFail(dto.messageId);
        if (!msg.isOneSeen) throw new BadRequestException("Msg cant update is should be one seen true")

        if (msg.sId.toString() == dto.myUser._id.toString()) return "You the sender"

        await this.messageService.findByIdAndUpdate(dto.messageId, {
            $addToSet: {
                oneSeenBy: dto.myUser._id
            }
        })
        return "Msg updated";
    }

    async editMessage(dto: RoomIdAndMsgIdDto, newContent: string) {
        await this.middlewareService.isThereRoomMemberOrThrow(
            dto.roomId,
            dto.myUser._id,
        );

        // Get the message and verify the sender
        let msg: IMessage = await this.messageService.getByIdOrFail(dto.messageId);

        // Only the sender can edit their own message
        if (msg.sId.toString() !== dto.myUser._id.toString()) {
            throw new ForbiddenException("You can only edit your own messages");
        }

        // Only text messages can be edited
        if (msg.mT !== MessageType.Text) {
            throw new BadRequestException("Only text messages can be edited");
        }

        // Check if message is within 1 hour edit window (3600000 milliseconds)
        const messageCreatedAt = new Date(msg.createdAt).getTime();
        const now = Date.now();
        const oneHourInMs = 3600000;
        if (now - messageCreatedAt > oneHourInMs) {
            throw new ForbiddenException("Messages can only be edited within 1 hour of being sent");
        }

        // Update the message content and set isEdited to true
        await this.messageService.findByIdAndUpdate(dto.messageId, {
            c: newContent,
            isEdited: true,
            updatedAt: new Date()
        });

        // Emit the updated message to all room members
        const updatedMsg = await this.messageService.getByIdOrFail(dto.messageId);
        this.socket.io
            .to(dto.roomId.toString())
            .emit(SocketEventsType.v1OnUpdateMessage, JSON.stringify(updatedMsg));

        return "Message updated successfully";
    }

    async reactToMessage(dto: RoomIdAndMsgIdDto, emoji: string) {
        await this.middlewareService.isThereRoomMemberOrThrow(
            dto.roomId,
            dto.myUser._id,
        );

        // Get the message
        let msg: IMessage = await this.messageService.getByIdOrFail(dto.messageId);

        // Verify the message is in the correct room
        if (msg.rId.toString() !== dto.roomId) {
            throw new BadRequestException("Message not found in this room");
        }

        // Get current reactions or initialize empty object
        let reactions = msg.reactions || {};
        const userId = dto.myUser._id.toString();

        // Check if user already has this specific reaction
        const hadThisReaction = reactions[emoji] &&
            (reactions[emoji] as any).userIds?.includes(userId);

        // Remove user's existing reaction if any (from any emoji)
        for (const [existingEmoji, reactionData] of Object.entries(reactions)) {
            if (reactionData && typeof reactionData === 'object' && 'userIds' in reactionData) {
                const userIds = (reactionData as any).userIds || [];
                const userIndex = userIds.indexOf(userId);
                if (userIndex > -1) {
                    userIds.splice(userIndex, 1);
                    if (userIds.length === 0) {
                        delete reactions[existingEmoji];
                    } else {
                        (reactions as any)[existingEmoji] = { ...reactionData, userIds };
                    }
                    break;
                }
            }
        }

        // Only add the reaction if user didn't have this specific reaction before
        if (!hadThisReaction) {
            if (reactions[emoji]) {
                const existingReaction = reactions[emoji] as any;
                const userIds = existingReaction.userIds || [];
                userIds.push(userId);
                reactions[emoji] = { emoji, userIds };
            } else {
                reactions[emoji] = { emoji, userIds: [userId] };
            }
        }

        // Update the message with new reactions
        await this.messageService.findByIdAndUpdate(dto.messageId, {
            reactions: reactions,
            updatedAt: new Date()
        });

        // Emit the updated message to all room members
        const updatedMsg = await this.messageService.getByIdOrFail(dto.messageId);
        this.socket.io
            .to(dto.roomId.toString())
            .emit(SocketEventsType.v1OnUpdateMessage, JSON.stringify(updatedMsg));

        return "Reaction updated successfully";
    }

    async replyFromNotification(dto: NotificationReplyDto) {
        // Create a SendMessageDto from the notification reply
        const sendDto = new SendMessageDto();
        sendDto.content = dto.content;
        sendDto.localId = dto.localId;
        sendDto.messageType = MessageType.Text;
        sendDto.myUser = dto.myUser;
        sendDto._roomId = dto.roomId;
        sendDto._platform = dto.platform || 'notification';

        // Send the message using existing createMessage logic
        return await this.createMessage(sendDto, false);
    }
}