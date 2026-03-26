/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { AgoraService } from '../../chat/agora/agora.service';
import { SocketIoService } from '../../chat/socket_io/socket_io.service';
import { ILiveStream, ILiveStreamParticipant, ILiveStreamMessage, ILiveStreamJoinRequest, ILiveStreamRecording, LiveStreamStatus, ParticipantRole } from './interfaces/live_stream.interface';
import { ILiveCategory } from './interfaces/live_category.interface';
import { AgoraRecordingService } from './services/agora-recording.service';
import { CreateLiveStreamDto, JoinLiveStreamDto, SendLiveStreamMessageDto, UpdateLiveStreamDto, LiveStreamFilterDto, RemoveParticipantDto, BanParticipantDto, RequestJoinStreamDto, RespondToJoinRequestDto, UpdateStreamFilterDto, StartRecordingDto, StopRecordingDto, RecordingFilterDto, InviteUserToStreamDto, RespondToInviteDto, UpdateRecordingPriceDto } from './dto/live_stream.dto';
import { UpdateRecordingPrivacyDto } from './dto/live_stream.dto';
import { IUser } from '../user_modules/user/entities/user.entity';
import { RecordingPurchase } from './schemas/recording_purchase.schema';
import { PesapalService } from '../payments/pesapal/pesapal.service';
import { UserService } from '../user_modules/user/user.service';
import { NotificationEmitterService } from '../../common/notification_emitter/notification_emitter.service';
import { UserDeviceService } from '../user_modules/user_device/user_device.service';
import { NotificationData } from '../../common/notification_emitter/notification.event';
import { PushKeyAndProvider } from '../../core/utils/interfaceces';
import { RoomMemberService } from '../../chat/room_member/room_member.service';
import { RoomType } from '../../core/utils/enums';

@Injectable()
export class LiveStreamService {
    constructor(
        @InjectModel('LiveStream') private readonly liveStreamModel: Model<ILiveStream>,
        @InjectModel('LiveStreamParticipant') private readonly participantModel: Model<ILiveStreamParticipant>,
        @InjectModel('LiveStreamMessage') private readonly messageModel: Model<ILiveStreamMessage>,
        @InjectModel('LiveStreamJoinRequest') private readonly joinRequestModel: Model<ILiveStreamJoinRequest>,
        @InjectModel('LiveStreamRecording') private readonly recordingModel: Model<ILiveStreamRecording>,
        @InjectModel(RecordingPurchase.name) private readonly purchaseModel: Model<RecordingPurchase>,
        @InjectModel('LiveCategory') private readonly categoryModel: Model<ILiveCategory>,
        @InjectModel('gift') private readonly giftModel: Model<any>,
        @InjectModel('GiftPurchase') private readonly giftPurchaseModel: Model<any>,
        @InjectModel('SupportDonation') private readonly supportDonationModel: Model<any>,
        private readonly agoraService: AgoraService,
        private readonly socketService: SocketIoService,
        private readonly userService: UserService,
        private readonly notificationEmitterService: NotificationEmitterService,
        private readonly userDeviceService: UserDeviceService,
        private readonly roomMemberService: RoomMemberService,
        private readonly agoraRecordingService: AgoraRecordingService,
        private readonly pesapalService: PesapalService,
    ) { }

    async getLiveCategories(): Promise<ILiveCategory[]> {
        return this.categoryModel.find({ isActive: true }).sort({ name: 1 }).exec();
    }

    async initiateSupportDonation(params: { streamId: string; amount: number; phone: string; user: IUser }) {
        const { streamId, amount, phone, user } = params;
        const stream = await this.liveStreamModel.findById(streamId);
        if (!stream) throw new NotFoundException('Live stream not found');
        const amountKes = Math.floor(Number(amount || 0));
        if (!amountKes || amountKes <= 0) throw new BadRequestException('Amount must be greater than 0');

        // Create donation record first
        const accountReference = `SUP-${streamId}`;
        const doc = await this.supportDonationModel.create({
            streamId,
            senderId: (user as any)._id,
            receiverId: stream.streamerId,
            currency: 'KES',
            amountKes,
            status: 'pending',
            accountReference,
        });

        // Initiate PesaPal payment
        const res = await this.pesapalService.submitOrder({
            userId: (user as any)._id,
            amount: amountKes,
            currency: 'KES',
            description: `Support donation to ${stream.title || 'host'}`,
            accountReference,
        });

        await this.supportDonationModel.findByIdAndUpdate(doc._id, {
            orderTrackingId: (res as any).orderTrackingId,
            merchantReference: (res as any).merchantReference,
        });

        return {
            donationId: doc._id.toString(),
            orderTrackingId: (res as any).orderTrackingId,
            redirectUrl: (res as any).redirectUrl,
            merchantReference: (res as any).merchantReference,
            amountKes,
        };
    }

    async getSupportDonationStatus(streamId: string, donationId: string, userId: string) {
        const doc: any = await this.supportDonationModel.findOne({ _id: donationId, streamId, senderId: userId }).lean();
        if (!doc) throw new NotFoundException('Donation not found');
        return {
            status: doc.status,
            donationId: doc._id?.toString?.(),
            amountKes: doc.amountKes,
            checkoutRequestId: doc.checkoutRequestId,
            merchantRequestId: doc.merchantRequestId,
            updatedAt: doc.updatedAt,
            creditedAt: doc.creditedAt,
        };
    }

    async createLiveStream(dto: CreateLiveStreamDto): Promise<ILiveStream> {
        // Generate unique channel name
        const channelName = `live_${uuidv4().replace(/-/g, '')}`;

        // Get Agora token for the channel
        const agoraAccess = this.agoraService.getAgoraAccessNew(channelName, true);

        // If approval is required, host must set a positive joinPrice
        if (dto.requiresApproval) {
            const price = dto.joinPrice ?? 0;
            if (!(price > 0)) {
                throw new BadRequestException('joinPrice is required and must be greater than 0 when requiresApproval is enabled');
            }
        }

        // Create live stream
        const liveStream = await this.liveStreamModel.create({
            title: dto.title,
            description: dto.description,
            streamerId: dto.myUser._id,
            streamerData: {
                _id: dto.myUser._id,
                fullName: dto.myUser.fullName,
                userImage: dto.myUser.userImage
            },
            channelName: channelName,
            agoraToken: agoraAccess.rtcToken,
            status: LiveStreamStatus.SCHEDULED,
            isPrivate: dto.isPrivate || false,
            requiresApproval: dto.requiresApproval || false,
            joinPrice: dto.joinPrice,
            allowedViewers: dto.allowedViewers || [],
            tags: dto.tags || [],
            thumbnailUrl: dto.thumbnailUrl
        });

        // Create streamer as participant
        await this.participantModel.create({
            streamId: liveStream._id,
            userId: dto.myUser._id,
            userData: {
                _id: dto.myUser._id,
                fullName: dto.myUser.fullName,
                userImage: dto.myUser.userImage
            },
            role: ParticipantRole.STREAMER,
            joinedAt: new Date(),
            isActive: true
        });

        return liveStream;
    }

    async startLiveStream(streamId: string, userId: string): Promise<ILiveStream> {
        const stream = await this.liveStreamModel.findById(streamId);
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }

        if (stream.streamerId !== userId) {
            throw new ForbiddenException('Only the streamer can start the stream');
        }

        if (stream.status !== LiveStreamStatus.SCHEDULED) {
            throw new BadRequestException('Stream is not in scheduled status');
        }

        // Update stream status
        stream.status = LiveStreamStatus.LIVE;
        stream.startedAt = new Date();
        await stream.save();

        // Emit socket event to notify users
        this.socketService.io.emit('live_stream_started', {
            streamId: stream._id,
            streamerData: stream.streamerData,
            title: stream.title
        });

        // Send push notifications to all users
        await this.sendLiveStreamNotification(stream);

        return stream;
    }

    async endLiveStream(streamId: string, userId: string): Promise<ILiveStream> {
        const stream = await this.liveStreamModel.findById(streamId);
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }

        if (stream.streamerId !== userId) {
            throw new ForbiddenException('Only the streamer can end the stream');
        }

        if (stream.status !== LiveStreamStatus.LIVE) {
            throw new BadRequestException('Stream is not currently live');
        }

        // Calculate duration
        const duration = stream.startedAt ? Math.floor((Date.now() - stream.startedAt.getTime()) / 1000) : 0;

        // Update stream status
        stream.status = LiveStreamStatus.ENDED;
        stream.endedAt = new Date();
        stream.duration = duration;
        await stream.save();

        // Mark all participants as inactive
        await this.participantModel.updateMany(
            { streamId: streamId, isActive: true },
            { isActive: false, leftAt: new Date() }
        );

        // Emit socket event to notify users
        this.socketService.io.to(streamId).emit('live_stream_ended', {
            streamId: stream._id,
            duration: duration
        });

        return stream;
    }

    async joinLiveStream(dto: JoinLiveStreamDto): Promise<{ stream: ILiveStream; agoraToken: string }> {
        const stream = await this.liveStreamModel.findById(dto.streamId);
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }

        if (stream.status !== LiveStreamStatus.LIVE) {
            throw new BadRequestException('Stream is not currently live');
        }

        // Check if stream is private and user is allowed
        if (stream.isPrivate && !stream.allowedViewers.includes(dto.myUser._id) && stream.streamerId !== dto.myUser._id) {
            throw new ForbiddenException('You are not allowed to view this private stream');
        }

        // Check if user is banned from this stream
        if (stream.bannedUsers && stream.bannedUsers.includes(dto.myUser._id)) {
            throw new ForbiddenException('You are banned from this stream');
        }

        // Check if public stream requires approval and user is not the streamer
        let approvedRequest: ILiveStreamJoinRequest | null = null;
        if (!stream.isPrivate && stream.requiresApproval && stream.streamerId !== dto.myUser._id) {
            // Check if user has an approved join request
            approvedRequest = await this.joinRequestModel.findOne({
                streamId: dto.streamId,
                userId: dto.myUser._id,
                status: 'approved'
            });

            if (!approvedRequest) {
                throw new ForbiddenException('You need approval from the host to join this stream. Please request to join first.');
            }
        } else {
            // Even if approval not required, see if there is an approved cohost invite to set elevated role
            approvedRequest = await this.joinRequestModel.findOne({
                streamId: dto.streamId,
                userId: dto.myUser._id,
                status: 'approved'
            });
        }

        // Check if user is already a participant
        let participant = await this.participantModel.findOne({
            streamId: dto.streamId,
            userId: dto.myUser._id
        });

        // Determine role based on approved request type
        const desiredRole = approvedRequest?.requestType === 'cohost' ? ParticipantRole.MODERATOR : ParticipantRole.VIEWER;

        if (!participant) {
            // Create new participant
            participant = await this.participantModel.create({
                streamId: dto.streamId,
                userId: dto.myUser._id,
                userData: {
                    _id: dto.myUser._id,
                    fullName: dto.myUser.fullName,
                    userImage: dto.myUser.userImage
                },
                role: desiredRole,
                joinedAt: new Date(),
                isActive: true
            });

            // Increment viewer count
            await this.liveStreamModel.findByIdAndUpdate(dto.streamId, {
                $inc: { viewerCount: 1 },
                $max: { maxViewers: stream.viewerCount + 1 }
            });
        } else {
            // Reactivate existing participant
            participant.isActive = true;
            participant.joinedAt = new Date();
            participant.leftAt = undefined;
            // Upgrade role if needed
            if (participant.role !== desiredRole) {
                participant.role = desiredRole;
            }
            await participant.save();

            if (participant.role === ParticipantRole.VIEWER) {
                await this.liveStreamModel.findByIdAndUpdate(dto.streamId, {
                    $inc: { viewerCount: 1 }
                });
            }
        }

        // Get fresh Agora token for the user
        const agoraAccess = this.agoraService.getAgoraAccessNew(stream.channelName, false);

        // Join socket room
        // Note: This would need to be handled in the socket gateway when user connects

        // Emit socket event to notify other participants
        this.socketService.io.to(dto.streamId).emit('user_joined_stream', {
            streamId: dto.streamId,
            userData: participant.userData,
            viewerCount: stream.viewerCount + 1
        });

        return {
            stream: stream,
            agoraToken: agoraAccess.rtcToken
        };
    }

    async leaveLiveStream(streamId: string, userId: string): Promise<void> {
        const participant = await this.participantModel.findOne({
            streamId: streamId,
            userId: userId,
            isActive: true
        });

        if (!participant) {
            return; // User was not in the stream
        }

        // Mark participant as inactive
        participant.isActive = false;
        participant.leftAt = new Date();
        await participant.save();

        // Decrement viewer count if it's a viewer
        if (participant.role === ParticipantRole.VIEWER) {
            await this.liveStreamModel.findByIdAndUpdate(streamId, {
                $inc: { viewerCount: -1 }
            });
        }

        // Emit socket event
        this.socketService.io.to(streamId).emit('user_left_stream', {
            streamId: streamId,
            userId: userId,
            userData: participant.userData
        });
    }

    async sendMessage(streamId: string, dto: SendLiveStreamMessageDto): Promise<ILiveStreamMessage> {
        const stream = await this.liveStreamModel.findById(streamId);
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }

        if (stream.status !== LiveStreamStatus.LIVE) {
            throw new BadRequestException('Stream is not currently live');
        }

        // Check if user is a participant
        const participant = await this.participantModel.findOne({
            streamId: streamId,
            userId: dto.myUser._id,
            isActive: true
        });

        if (!participant) {
            throw new ForbiddenException('You must join the stream to send messages');
        }

        // If message is a gift, enforce successful gift purchase and consume one
        if (dto.messageType === 'gift' && dto.giftData && dto.giftData.giftId) {
            const giftId = dto.giftData.giftId as string;
            // Find an unused successful purchase for this sender/stream/gift
            const purchase = await this.giftPurchaseModel.findOneAndUpdate(
                {
                    streamId: streamId,
                    giftId: giftId,
                    senderId: dto.myUser._id,
                    status: 'success',
                    used: { $ne: true },
                },
                { $set: { used: true } },
                { new: true, sort: { createdAt: 1 } },
            );
            if (!purchase) {
                throw new BadRequestException('Purchase required: please buy this gift via M-Pesa first');
            }
            // Credit host balance now that gift is consumed
            try {
                await this.userService.addToBalance((await this.liveStreamModel.findById(streamId))!.streamerId as any, purchase.amountKes);
            } catch { }
            // Attach normalized giftData for message consumers
            dto.giftData.giftPrice = purchase.amountKes;
            dto.giftData.currency = 'KES';
        }

        // Create message
        const message = await this.messageModel.create({
            streamId: streamId,
            userId: dto.myUser._id,
            userData: {
                _id: dto.myUser._id,
                fullName: dto.myUser.fullName,
                userImage: dto.myUser.userImage
            },
            message: dto.message,
            messageType: dto.messageType || 'text',
            giftData: dto.giftData
        });

        // Emit socket event
        this.socketService.io.to(streamId).emit('new_stream_message', message);

        return message;
    }

    async initiateGiftPurchase(params: { streamId: string; giftId: string; phone: string; user: IUser }) {
        const { streamId, giftId, phone, user } = params;
        const stream = await this.liveStreamModel.findById(streamId);
        if (!stream) throw new NotFoundException('Live stream not found');
        const gift: any = await this.giftModel.findById(giftId);
        if (!gift || gift.isActive === false) throw new NotFoundException('Gift not found');

        // Compute KES price
        const rate = Number(process.env.USD_TO_KES_RATE || 160);
        const amountKes = gift.priceKes ?? (gift.currency === 'USD' ? Math.round((gift.priceUsd ?? gift.price) * rate) : gift.price);
        if (!amountKes || amountKes <= 0) throw new BadRequestException('Gift price is not configured');

        // Create purchase record first
        const accountReference = `GIFT-${streamId}-${giftId}`;
        const doc = await this.giftPurchaseModel.create({
            streamId,
            giftId,
            senderId: user._id,
            receiverId: stream.streamerId,
            currency: 'KES',
            amountKes,
            status: 'pending',
            accountReference,
        });

        // Initiate PesaPal payment
        const res = await this.pesapalService.submitOrder({
            userId: user._id,
            amount: amountKes,
            currency: 'KES',
            description: `Gift purchase ${gift.name}`,
            accountReference,
        });

        await this.giftPurchaseModel.findByIdAndUpdate(doc._id, {
            orderTrackingId: res.orderTrackingId,
            merchantReference: res.merchantReference,
        });

        return {
            purchaseId: doc._id.toString(),
            orderTrackingId: res.orderTrackingId,
            redirectUrl: res.redirectUrl,
            merchantReference: res.merchantReference,
            amountKes,
        };
    }

    async getGiftPurchaseStatus(streamId: string, giftId: string, userId: string) {
        const doc: any = await this.giftPurchaseModel.findOne({ streamId, giftId, senderId: userId })
            .sort({ createdAt: -1 })
            .lean();
        if (!doc) return { status: 'none' };
        return {
            status: doc.status,
            purchaseId: doc._id?.toString?.(),
            amountKes: doc.amountKes,
            checkoutRequestId: doc.checkoutRequestId,
            merchantRequestId: doc.merchantRequestId,
            updatedAt: doc.updatedAt,
        };
    }

    async updateStreamFilter(streamId: string, dto: UpdateStreamFilterDto): Promise<{ success: boolean }> {
        // Verify stream exists and user is the host
        const stream = await this.liveStreamModel.findById(streamId);
        if (!stream) {
            throw new NotFoundException('Stream not found');
        }

        if (stream.streamerId !== dto.myUser._id) {
            throw new ForbiddenException('Only the host can update stream filters');
        }

        if (stream.status !== LiveStreamStatus.LIVE) {
            throw new BadRequestException('Can only update filters for live streams');
        }

        // Emit socket event to all participants in the stream
        this.socketService.io.to(streamId).emit('stream_filter_updated', {
            streamId: streamId,
            filterData: {
                filterType: dto.filterType,
                faceFilterType: dto.faceFilterType,
                intensity: dto.intensity,
                isEnabled: dto.isEnabled
            },
            hostId: dto.myUser._id
        });

        return { success: true };
    }

    async getLiveStreams(filter: LiveStreamFilterDto, userId?: string): Promise<{ streams: ILiveStream[]; total: number }> {
        const query: any = {};

        // Filter by status
        if (filter.status) {
            query.status = filter.status;
        } else {
            // Default to live streams
            query.status = LiveStreamStatus.LIVE;
        }

        // Filter by search term
        if (filter.search) {
            query.$or = [
                { title: { $regex: filter.search, $options: 'i' } },
                { description: { $regex: filter.search, $options: 'i' } },
                { 'streamerData.fullName': { $regex: filter.search, $options: 'i' } }
            ];
        }

        // Filter by tags
        if (filter.tags && filter.tags.length > 0) {
            query.tags = { $in: filter.tags };
        }

        // Only show public streams or private streams user has access to
        if (userId) {
            query.$or = [
                { isPrivate: false },
                { isPrivate: true, allowedViewers: { $in: [userId] } },
                { isPrivate: true, streamerId: userId } // User can see their own private streams
            ];
        } else {
            // If no userId provided, only show public streams
            query.isPrivate = false;
        }

        // Sorting
        const sortOptions: any = {};
        if (filter.sortBy) {
            sortOptions[filter.sortBy] = filter.sortOrder === 'asc' ? 1 : -1;
        } else {
            sortOptions.createdAt = -1; // Default sort by newest
        }

        const page = filter.page || 1;
        const limit = filter.limit || 20;
        const skip = (page - 1) * limit;

        const [streams, total] = await Promise.all([
            this.liveStreamModel.find(query)
                .sort(sortOptions)
                .skip(skip)
                .limit(limit)
                .exec(),
            this.liveStreamModel.countDocuments(query)
        ]);

        return { streams, total };
    }

    async getStreamById(streamId: string): Promise<ILiveStream> {
        const stream = await this.liveStreamModel.findById(streamId);
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }
        return stream;
    }

    async getStreamMessages(streamId: string, page: number = 1, limit: number = 50): Promise<ILiveStreamMessage[]> {
        const skip = (page - 1) * limit;
        return this.messageModel.find({ streamId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .exec();
    }

    async getStreamParticipants(streamId: string): Promise<ILiveStreamParticipant[]> {
        return this.participantModel.find({ streamId, isActive: true })
            .sort({ joinedAt: 1 })
            .exec();
    }

    async pinMessage(streamId: string, messageId: string, userId: string): Promise<ILiveStreamMessage> {
        // Check if user is the streamer
        const stream = await this.liveStreamModel.findById(streamId);
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }

        if (stream.streamerId !== userId) {
            throw new ForbiddenException('Only the streamer can pin messages');
        }

        // Check if message exists and belongs to this stream
        const message = await this.messageModel.findOne({ _id: messageId, streamId });
        if (!message) {
            throw new NotFoundException('Message not found');
        }

        // Unpin any previously pinned message
        await this.messageModel.updateMany(
            { streamId, isPinned: true },
            { isPinned: false, pinnedAt: undefined, pinnedBy: undefined }
        );

        // Pin the new message
        message.isPinned = true;
        message.pinnedAt = new Date();
        message.pinnedBy = userId;
        await message.save();

        // Update stream with pinned message ID
        stream.pinnedMessageId = messageId;
        await stream.save();

        // Emit socket event to notify all participants
        this.socketService.io.to(streamId).emit('message_pinned', {
            streamId,
            message: message
        });

        return message;
    }

    async unpinMessage(streamId: string, messageId: string, userId: string): Promise<{ success: boolean }> {
        // Check if user is the streamer
        const stream = await this.liveStreamModel.findById(streamId);
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }

        if (stream.streamerId !== userId) {
            throw new ForbiddenException('Only the streamer can unpin messages');
        }

        // Check if message exists and is pinned
        const message = await this.messageModel.findOne({ _id: messageId, streamId, isPinned: true });
        if (!message) {
            throw new NotFoundException('Pinned message not found');
        }

        // Unpin the message
        message.isPinned = false;
        message.pinnedAt = undefined;
        message.pinnedBy = undefined;
        await message.save();

        // Remove pinned message ID from stream
        stream.pinnedMessageId = undefined;
        await stream.save();

        // Emit socket event to notify all participants
        this.socketService.io.to(streamId).emit('message_unpinned', {
            streamId,
            messageId
        });

        return { success: true };
    }

    async getPinnedMessage(streamId: string): Promise<ILiveStreamMessage | null> {
        const stream = await this.liveStreamModel.findById(streamId);
        if (!stream || !stream.pinnedMessageId) {
            return null;
        }

        return this.messageModel.findOne({ _id: stream.pinnedMessageId, isPinned: true });
    }

    async removeParticipant(streamId: string, dto: RemoveParticipantDto): Promise<{ success: boolean }> {
        // Check if user is the streamer
        const stream = await this.liveStreamModel.findById(streamId);
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }

        if (stream.streamerId !== dto.myUser._id) {
            throw new ForbiddenException('Only the streamer can remove participants');
        }

        // Find the participant
        const participant = await this.participantModel.findOne({
            _id: dto.participantId,
            streamId: streamId,
            isActive: true
        });

        if (!participant) {
            throw new NotFoundException('Participant not found or already removed');
        }

        // Cannot remove the streamer themselves
        if (participant.userId === stream.streamerId) {
            throw new BadRequestException('Cannot remove the streamer from their own stream');
        }

        // Mark participant as inactive (removed)
        participant.isActive = false;
        participant.leftAt = new Date();
        await participant.save();

        // Decrement viewer count if it's a viewer
        if (participant.role === ParticipantRole.VIEWER) {
            await this.liveStreamModel.findByIdAndUpdate(streamId, {
                $inc: { viewerCount: -1 }
            });
        }

        // Emit socket event to notify the removed user and others
        this.socketService.io.to(streamId).emit('participant_removed', {
            streamId: streamId,
            participantId: dto.participantId,
            userId: participant.userId,
            userData: participant.userData,
            reason: dto.reason || 'Removed by host'
        });

        // Send direct message to the removed user
        this.socketService.io.to(participant.userId).emit('removed_from_stream', {
            streamId: streamId,
            reason: dto.reason || 'You were removed from the stream by the host'
        });

        return { success: true };
    }

    async banParticipant(streamId: string, dto: BanParticipantDto): Promise<{ success: boolean }> {
        // Check if user is the streamer
        const stream = await this.liveStreamModel.findById(streamId);
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }

        if (stream.streamerId !== dto.myUser._id) {
            throw new ForbiddenException('Only the streamer can ban participants');
        }

        // Find the participant
        const participant = await this.participantModel.findOne({
            _id: dto.participantId,
            streamId: streamId,
            isActive: true
        });

        if (!participant) {
            throw new NotFoundException('Participant not found or already removed');
        }

        // Cannot ban the streamer themselves
        if (participant.userId === stream.streamerId) {
            throw new BadRequestException('Cannot ban the streamer from their own stream');
        }

        // Mark participant as inactive (banned)
        participant.isActive = false;
        participant.leftAt = new Date();
        await participant.save();

        // Add user to banned list for this stream
        if (!stream.bannedUsers) {
            stream.bannedUsers = [];
        }
        if (!stream.bannedUsers.includes(participant.userId)) {
            stream.bannedUsers.push(participant.userId);
            await stream.save();
        }

        // Decrement viewer count if it's a viewer
        if (participant.role === ParticipantRole.VIEWER) {
            await this.liveStreamModel.findByIdAndUpdate(streamId, {
                $inc: { viewerCount: -1 }
            });
        }

        // Emit socket event to notify the banned user and others
        this.socketService.io.to(streamId).emit('participant_banned', {
            streamId: streamId,
            participantId: dto.participantId,
            userId: participant.userId,
            userData: participant.userData,
            reason: dto.reason || 'Banned by host',
            duration: dto.duration || 'permanent'
        });

        // Send direct message to the banned user
        this.socketService.io.to(participant.userId).emit('banned_from_stream', {
            streamId: streamId,
            reason: dto.reason || 'You were banned from the stream by the host',
            duration: dto.duration || 'permanent'
        });

        return { success: true };
    }

    async likeStream(streamId: string, userId: string): Promise<{ success: boolean; likesCount: number; isLiked: boolean }> {
        const stream = await this.liveStreamModel.findById(streamId);
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }

        // Check if user already liked the stream
        const hasLiked = stream.likedBy && stream.likedBy.includes(userId);

        if (hasLiked) {
            // Unlike the stream
            await this.liveStreamModel.findByIdAndUpdate(streamId, {
                $pull: { likedBy: userId },
                $inc: { likesCount: -1 }
            });

            // Emit socket event
            this.socketService.io.to(streamId).emit('stream_unliked', {
                streamId: streamId,
                userId: userId,
                likesCount: stream.likesCount - 1
            });

            return {
                success: true,
                likesCount: stream.likesCount - 1,
                isLiked: false
            };
        } else {
            // Like the stream
            await this.liveStreamModel.findByIdAndUpdate(streamId, {
                $addToSet: { likedBy: userId },
                $inc: { likesCount: 1 }
            });

            // Emit socket event
            this.socketService.io.to(streamId).emit('stream_liked', {
                streamId: streamId,
                userId: userId,
                likesCount: stream.likesCount + 1
            });

            return {
                success: true,
                likesCount: stream.likesCount + 1,
                isLiked: true
            };
        }
    }

    async getStreamLikes(streamId: string): Promise<{ likesCount: number; likedBy: string[] }> {
        const stream = await this.liveStreamModel.findById(streamId).select('likesCount likedBy');
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }

        return {
            likesCount: stream.likesCount || 0,
            likedBy: stream.likedBy || []
        };
    }

    async requestJoinStream(dto: RequestJoinStreamDto): Promise<{ success: boolean; message: string }> {
        const stream = await this.liveStreamModel.findById(dto.streamId);
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }

        if (stream.status !== LiveStreamStatus.LIVE) {
            throw new BadRequestException('Stream is not currently live');
        }

        // Check if user is the streamer
        if (stream.streamerId === dto.myUser._id) {
            throw new BadRequestException('You cannot request to join your own stream');
        }

        // Check if user is banned
        if (stream.bannedUsers && stream.bannedUsers.includes(dto.myUser._id)) {
            throw new ForbiddenException('You are banned from this stream');
        }

        // Check if stream requires approval
        if (stream.isPrivate) {
            throw new BadRequestException('This is a private stream. You need to be invited.');
        }

        // Enforce 18+ for all join requests
        if (dto.age == null || dto.age < 18) {
            throw new BadRequestException('You must be 18 or older to request joining this stream');
        }

        // Co-host requests ALWAYS require approval, regardless of requiresApproval setting
        // Only check requiresApproval for viewer join requests
        if (dto.requestType === 'viewer' && !stream.requiresApproval) {
            throw new BadRequestException('This stream does not require approval. You can join directly.');
        }

        // When approval is required for viewers, require age >= 18 and payment (stubbed)
        if (dto.requestType !== 'cohost' && stream.requiresApproval) {
            const requiredPrice = stream.joinPrice ?? 0;
            if (dto.age == null || dto.age < 18) {
                throw new BadRequestException('You must be 18 or older to request joining this stream');
            }
            if (requiredPrice > 0) {
                const paid = dto.amountPaid ?? 0;
                if (paid < requiredPrice) {
                    throw new BadRequestException(`Payment required: please pay ${requiredPrice} to request joining`);
                }
            }
        }

        // Check if user already has a pending or approved request
        const existingRequest = await this.joinRequestModel.findOne({
            streamId: dto.streamId,
            userId: dto.myUser._id,
            status: { $in: ['pending', 'approved'] }
        });

        if (existingRequest) {
            if (existingRequest.status === 'pending') {
                throw new BadRequestException('You already have a pending join request for this stream');
            } else {
                throw new BadRequestException('You already have approval to join this stream');
            }
        }

        // Create join request
        const joinRequest = await this.joinRequestModel.create({
            streamId: dto.streamId,
            userId: dto.myUser._id,
            userData: {
                _id: dto.myUser._id,
                fullName: dto.myUser.fullName,
                userImage: dto.myUser.userImage
            },
            status: 'pending',
            requestType: dto.requestType || 'viewer',
            initiatedByHost: false,
            age: dto.age,
            amountPaid: dto.amountPaid,
            paid: (dto.amountPaid ?? 0) >= (stream.joinPrice ?? 0),
            requestedAt: new Date()
        });

        // Notify the streamer via socket
        this.socketService.io.to(stream.streamerId).emit('join_request_received', {
            requestId: joinRequest._id,
            streamId: dto.streamId,
            userData: joinRequest.userData,
            requestedAt: joinRequest.requestedAt
        });

        return {
            success: true,
            message: 'Join request sent to the host. Please wait for approval.'
        };
    }

    async inviteUserToStream(dto: InviteUserToStreamDto): Promise<{ success: boolean; message: string; requestId: string }> {
        const stream = await this.liveStreamModel.findById(dto.streamId);
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }

        if (stream.streamerId !== dto.myUser._id) {
            throw new ForbiddenException('Only the streamer can invite users');
        }

        if (stream.status !== LiveStreamStatus.LIVE) {
            throw new BadRequestException('Stream is not currently live');
        }

        if (dto.userId === dto.myUser._id) {
            throw new BadRequestException('Cannot invite yourself');
        }

        if (stream.bannedUsers && stream.bannedUsers.includes(dto.userId)) {
            throw new ForbiddenException('This user is banned from the stream');
        }

        // Check existing pending or approved invite/request for this user
        const existing = await this.joinRequestModel.findOne({
            streamId: dto.streamId,
            userId: dto.userId,
            status: { $in: ['pending', 'approved'] }
        });
        if (existing) {
            throw new BadRequestException('There is already a pending/approved request for this user');
        }

        // Create invite as a join request initiated by host
        const joinRequest = await this.joinRequestModel.create({
            streamId: dto.streamId,
            userId: dto.userId,
            userData: await (async () => {
                try {
                    const u = await this.userService.findById(dto.userId);
                    return { _id: u._id, fullName: u.fullName, userImage: u.userImage };
                } catch {
                    return { _id: dto.userId, fullName: 'User', userImage: '' };
                }
            })(),
            status: 'pending',
            requestType: dto.requestType || 'cohost',
            initiatedByHost: true,
            requestedAt: new Date()
        });

        // Notify invitee via socket
        this.socketService.io.to(dto.userId).emit('join_invite_received', {
            requestId: joinRequest._id,
            streamId: dto.streamId,
            requestType: joinRequest.requestType,
            streamerId: stream.streamerId,
            streamerData: stream.streamerData,
            message: 'You are invited to join the live stream'
        });

        return {
            success: true,
            message: 'Invite sent successfully',
            requestId: joinRequest._id
        };
    }

    async respondToInvite(dto: RespondToInviteDto): Promise<{ success: boolean; message: string }> {
        const joinRequest = await this.joinRequestModel.findById(dto.requestId);
        if (!joinRequest) {
            throw new NotFoundException('Invite not found');
        }

        if (!joinRequest.initiatedByHost) {
            throw new BadRequestException('This request is not a host invite');
        }

        if (joinRequest.userId !== dto.myUser._id) {
            throw new ForbiddenException('Only the invited user can respond');
        }

        if (joinRequest.status !== 'pending') {
            throw new BadRequestException('This invite has already been responded to');
        }

        const stream = await this.liveStreamModel.findById(joinRequest.streamId);
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }

        if (stream.status !== LiveStreamStatus.LIVE) {
            throw new BadRequestException('Stream is not currently live');
        }

        // Update status
        const approved = dto.action === 'accept';
        joinRequest.status = approved ? 'approved' : 'denied';
        joinRequest.respondedAt = new Date();
        joinRequest.respondedBy = dto.myUser._id;
        await joinRequest.save();

        // Notify streamer
        this.socketService.io.to(stream.streamerId).emit('join_invite_response', {
            requestId: dto.requestId,
            streamId: joinRequest.streamId,
            status: joinRequest.status,
            userId: dto.myUser._id,
            userData: joinRequest.userData
        });

        // Optionally notify stream room when approved
        if (approved) {
            this.socketService.io.to(joinRequest.streamId).emit('join_request_approved', {
                streamId: joinRequest.streamId,
                userId: joinRequest.userId,
                userData: joinRequest.userData
            });
        }

        return {
            success: true,
            message: approved ? 'Invite accepted' : 'Invite rejected'
        };
    }

    async respondToJoinRequest(dto: RespondToJoinRequestDto): Promise<{ success: boolean; message: string }> {
        const joinRequest = await this.joinRequestModel.findById(dto.requestId);
        if (!joinRequest) {
            throw new NotFoundException('Join request not found');
        }

        const stream = await this.liveStreamModel.findById(joinRequest.streamId);
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }

        // Check if user is the streamer
        if (stream.streamerId !== dto.myUser._id) {
            throw new ForbiddenException('Only the streamer can respond to join requests');
        }

        // Check if request is still pending
        if (joinRequest.status !== 'pending') {
            throw new BadRequestException('This join request has already been responded to');
        }

        // Update join request
        joinRequest.status = dto.action === 'approve' ? 'approved' : 'denied';
        joinRequest.respondedAt = new Date();
        joinRequest.respondedBy = dto.myUser._id;
        await joinRequest.save();

        // Notify the requester via socket (snake_case)
        this.socketService.io.to(joinRequest.userId).emit('join_request_response', {
            requestId: dto.requestId,
            streamId: joinRequest.streamId,
            status: joinRequest.status,
            streamTitle: stream.title,
            requestType: joinRequest.requestType,
            message: dto.action === 'approve'
                ? 'Your join request has been approved! You can now join the stream.'
                : 'Your join request has been denied.'
        });

        // Also notify using camelCase event with approved boolean for existing clients
        this.socketService.io.to(joinRequest.userId).emit('joinRequestResponse', {
            streamId: joinRequest.streamId,
            approved: dto.action === 'approve',
            requestType: joinRequest.requestType,
            message: dto.action === 'approve'
                ? 'Your join request has been approved! You can now join the stream.'
                : 'Your join request was not approved.'
        });

        // If approved, also emit to the stream room
        if (dto.action === 'approve') {
            this.socketService.io.to(joinRequest.streamId).emit('join_request_approved', {
                userId: joinRequest.userId,
                userData: joinRequest.userData
            });
        }

        return {
            success: true,
            message: `Join request ${dto.action === 'approve' ? 'approved' : 'denied'} successfully`
        };
    }

    async getJoinRequests(streamId: string, userId: string): Promise<ILiveStreamJoinRequest[]> {
        const stream = await this.liveStreamModel.findById(streamId);
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }

        // Check if user is the streamer
        if (stream.streamerId !== userId) {
            throw new ForbiddenException('Only the streamer can view join requests');
        }

        return await this.joinRequestModel.find({
            streamId: streamId,
            status: 'pending'
        }).sort({ requestedAt: -1 });
    }

    // Get user's own recordings
    async getUserRecordings(userId: string, page: number = 1, limit: number = 20): Promise<{ recordings: ILiveStreamRecording[]; total: number }> {
        const skip = (page - 1) * limit;

        const [recordings, total] = await Promise.all([
            this.recordingModel.find({ streamerId: userId })
                .sort({ recordedAt: -1 })
                .skip(skip)
                .limit(limit)
                .exec(),
            this.recordingModel.countDocuments({ streamerId: userId })
        ]);

        return { recordings, total };
    }

    /**
     * Send push notifications when someone starts live streaming
     * Only notify users who already have a direct (Single) chat room with the streamer.
     * For private streams, only notify allowedViewers (intersected with direct chat users if provided).
     */
    private async sendLiveStreamNotification(stream: ILiveStream): Promise<void> {
        try {
            const streamerId = stream.streamerId.toString();

            // 1) Build candidate recipient user IDs
            let recipientUserIds: string[] = [];

            if (stream.isPrivate) {
                // Private: notify only explicitly allowed viewers (excluding the streamer)
                const allowed = Array.isArray(stream.allowedViewers) ? stream.allowedViewers : [];
                recipientUserIds = allowed.map((id: any) => id.toString()).filter((id) => id !== streamerId);
            } else {
                // Public: notify only users who have a Single chat with the streamer and haven't deleted it
                const directChatMembers = await this.roomMemberService.findAll(
                    { pId: stream.streamerId, rT: RoomType.Single, isD: false },
                    'uId pId rT isD'
                );
                const set = new Set<string>();
                for (const m of directChatMembers as any[]) {
                    const uid = (m.uId?.toString?.() ?? String(m.uId));
                    if (uid && uid !== streamerId) set.add(uid);
                }
                recipientUserIds = Array.from(set);
            }

            if (!recipientUserIds.length) {
                console.log('sendLiveStreamNotification: no recipients found (restricted to direct chat users).');
                return;
            }

            // 2) Collect push tokens for those users
            const tokens = new PushKeyAndProvider([], [], []);
            for (const userId of recipientUserIds) {
                const userTokens = await this.userDeviceService.getUserPushTokens(userId);
                tokens.fcm.push(...userTokens.fcm);
                tokens.oneSignal.push(...userTokens.oneSignal);
            }

            if (tokens.fcm.length === 0 && tokens.oneSignal.length === 0) {
                console.log('sendLiveStreamNotification: no push tokens found for recipients.');
                return;
            }

            // Shared payload
            const title = `${stream.streamerData.fullName} is live`;
            const body = stream.title || 'Join the live stream now!';
            const payloadData = {
                type: 'live_stream',
                streamId: stream._id.toString(),
                streamerId: streamerId,
                streamerName: stream.streamerData.fullName,
                title: stream.title || '',
                fromVChat: 'false', // Mark as non-VChat notification
            };

            // 3) Send notifications
            if (tokens.fcm.length > 0) {
                await this.notificationEmitterService.fcmSend(
                    new NotificationData({ tokens: tokens.fcm, title, body, tag: 'live_stream', data: payloadData })
                );
            }
            if (tokens.oneSignal.length > 0) {
                await this.notificationEmitterService.oneSignalSend(
                    new NotificationData({ tokens: tokens.oneSignal, title, body, tag: 'live_stream', data: payloadData })
                );
            }

            console.log(
                `Live stream notification (restricted) sent to ${tokens.fcm.length + tokens.oneSignal.length} device tokens for stream: ${stream.title}`
            );
        } catch (error) {
            console.error('Error sending live stream notification (restricted):', error);
            // Don't throw error to avoid breaking the live stream start process
        }
    }

    // Recording Methods
    async startRecording(dto: StartRecordingDto): Promise<{ success: boolean; message: string }> {
        const stream = await this.liveStreamModel.findById(dto.streamId);
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }

        if (stream.streamerId !== dto.myUser._id) {
            throw new ForbiddenException('Only the streamer can start recording');
        }

        if (stream.status !== LiveStreamStatus.LIVE) {
            throw new BadRequestException('Stream must be live to start recording');
        }

        // Check if there's already an active recording for this stream
        const existingRecording = await this.recordingModel.findOne({
            streamId: dto.streamId,
            status: 'processing'
        });

        if (existingRecording) {
            throw new BadRequestException('Recording is already in progress for this stream');
        }

        console.log(`Starting recording for stream: ${dto.streamId}, streamer: ${dto.myUser._id}`);

        // Start Agora Cloud Recording (with fallback for development)
        let agoraRecordingData;
        try {
            agoraRecordingData = await this.agoraRecordingService.startCloudRecording(
                stream.channelName,
                0 // Use uid 0 for recording bot
            );
            console.log('Agora recording started:', agoraRecordingData);
        } catch (error) {
            console.error('Failed to start Agora recording:', error);
            console.log('Using development fallback - recording metadata only');

            // Development fallback: simulate recording session
            agoraRecordingData = {
                resourceId: `dev_resource_${Date.now()}`,
                sid: `dev_session_${Date.now()}`
            };
        }

        // Create recording record with processing status
        const recording = await this.recordingModel.create({
            streamId: dto.streamId,
            title: stream.title,
            description: stream.description,
            streamerId: dto.myUser._id, // Use authenticated user ID
            streamerData: stream.streamerData,
            // recordingUrl will be set when recording stops
            thumbnailUrl: stream.thumbnailUrl,
            duration: 0,
            recordedAt: new Date(),
            viewCount: 0,
            likesCount: 0,
            likedBy: [],
            tags: stream.tags || [],
            isPrivate: stream.isPrivate,
            allowedViewers: stream.allowedViewers || [],
            status: 'processing',
            quality: dto.quality || '720p',
            // Store Agora recording session data
            agoraResourceId: agoraRecordingData.resourceId,
            agoraSid: agoraRecordingData.sid
        });

        // Emit socket event to notify the streamer that recording started
        this.socketService.io.to(stream.streamerId).emit('recording_started', {
            streamId: dto.streamId,
            recordingId: recording._id,
            message: 'Recording started successfully'
        });

        // Emit to all participants
        this.socketService.io.to(dto.streamId).emit('stream_recording_started', {
            streamId: dto.streamId,
            recordingId: recording._id
        });

        return {
            success: true,
            message: 'Recording started successfully'
        };
    }

    async stopRecording(dto: StopRecordingDto): Promise<ILiveStreamRecording> {
        const stream = await this.liveStreamModel.findById(dto.streamId);
        if (!stream) {
            throw new NotFoundException('Live stream not found');
        }

        if (stream.streamerId !== dto.myUser._id) {
            throw new ForbiddenException('Only the streamer can stop recording');
        }

        // Atomically transition the active recording to 'stopping' to avoid duplicate stop calls
        let recording = await this.recordingModel.findOneAndUpdate(
            { streamId: dto.streamId, status: 'processing' },
            { $set: { status: 'stopping' } },
            { new: true }
        );

        if (!recording) {
            // If a stop request already processed, return the latest recording for this stream
            const existing = await this.recordingModel.findOne({ streamId: dto.streamId }).sort({ recordedAt: -1 });
            if (existing) {
                return existing;
            }
            throw new NotFoundException('No active recording found for this stream');
        }

        // Calculate duration if not provided
        const duration = dto.duration || Math.floor((Date.now() - recording.recordedAt.getTime()) / 1000);

        // Stop Agora Cloud Recording
        let recordingResult: { recordingUrl?: string; fileList?: any[] } | undefined;
        try {
            recordingResult = await this.agoraRecordingService.stopCloudRecording(
                stream.channelName,
                0, // uid used for recording
                recording.agoraResourceId,
                recording.agoraSid
            );
            console.log('Agora recording stopped:', recordingResult);
        } catch (error: any) {
            // Handle repeated stop (Agora code 49) gracefully
            const code = error?.response?.data?.code;
            if (code === 49) {
                console.warn('Agora returned code 49 (repeated stop). Continuing gracefully.');
            } else {
                console.error('Failed to stop Agora recording:', error);
            }
            // Don't throw error, proceed with fallback URL if provided
        }

        // Use Agora recording URL if available, otherwise use provided URL
        const finalRecordingUrl = recordingResult?.recordingUrl || dto.recordingUrl;

        // Update recording with final details
        recording.recordingUrl = finalRecordingUrl;
        recording.duration = duration;
        recording.fileSize = dto.fileSize;
        recording.thumbnailUrl = dto.thumbnailUrl || recording.thumbnailUrl;
        recording.status = 'completed';
        recording.agoraFileList = recordingResult?.fileList || [];
        await recording.save();

        // Emit socket event to notify participants
        this.socketService.io.to(dto.streamId).emit('stream_recording_stopped', {
            streamId: dto.streamId,
            recordingId: recording._id,
            recordingUrl: finalRecordingUrl,
            duration: duration
        });

        // Emit to streamer
        this.socketService.io.to(stream.streamerId).emit('recording_completed', {
            streamId: dto.streamId,
            recordingId: recording._id,
            recordingUrl: finalRecordingUrl,
            duration: duration,
            message: 'Recording completed and saved successfully'
        });

        return recording;
    }

    async getRecordings(filter: RecordingFilterDto, userId?: string): Promise<{ recordings: ILiveStreamRecording[]; total: number }> {
        console.log(`Getting recordings for user: ${userId}, filter:`, filter);
        const query: any = {};

        // Filter by status
        if (filter.status) {
            query.status = filter.status;
        } else {
            // Default to completed recordings
            query.status = 'completed';
        }

        // Filter by search term
        if (filter.search) {
            query.$or = [
                { title: { $regex: filter.search, $options: 'i' } },
                { description: { $regex: filter.search, $options: 'i' } },
                { 'streamerData.fullName': { $regex: filter.search, $options: 'i' } }
            ];
        }

        // Filter by streamer
        if (filter.streamerId) {
            query.streamerId = filter.streamerId;
        }

        // Filter by tags
        if (filter.tags && filter.tags.length > 0) {
            query.tags = { $in: filter.tags };
        }

        // Only show public recordings or private recordings user has access to
        if (userId) {
            // Skip validation for now - just use the userId as is
            query.$or = [
                { isPrivate: false },
                { isPrivate: true, allowedViewers: { $in: [userId] } },
                { isPrivate: true, streamerId: userId } // User can see their own private recordings
            ];
        } else {
            // If no userId provided, only show public recordings
            query.isPrivate = false;
        }

        // Sorting
        const sortOptions: any = {};
        if (filter.sortBy) {
            sortOptions[filter.sortBy] = filter.sortOrder === 'asc' ? 1 : -1;
        } else {
            sortOptions.recordedAt = -1; // Default sort by newest
        }

        const page = filter.page || 1;
        const limit = filter.limit || 20;
        const skip = (page - 1) * limit;

        const [recordings, total] = await Promise.all([
            this.recordingModel.find(query)
                .sort(sortOptions)
                .skip(skip)
                .limit(limit)
                .exec(),
            this.recordingModel.countDocuments(query)
        ]);

        console.log(`Found ${recordings.length} recordings for query:`, query);
        console.log('Recording details:', recordings.map(r => ({ id: r._id, title: r.title, streamerId: r.streamerId, status: r.status })));

        return { recordings, total };
    }

    async getRecordingById(recordingId: string): Promise<ILiveStreamRecording> {
        const recording = await this.recordingModel.findById(recordingId);
        if (!recording) {
            throw new NotFoundException('Recording not found');
        }
        return recording;
    }

    // ===== Paid recordings (M-Pesa) =====
    private async findUserSuccessfulPurchase(recordingId: string, userId: string) {
        return this.purchaseModel.findOne({ recordingId, userId, status: 'success' }).sort({ createdAt: -1 });
    }

    async getRecordingAccess(recordingId: string, userId: string): Promise<{ canView: boolean; price: number; purchased: boolean; lastStatus?: string }> {
        const recording = await this.getRecordingById(recordingId);
        const price = recording.price ?? 0;
        if (price <= 0) {
            // Free recording
            return { canView: true, price: 0, purchased: true, lastStatus: 'free' };
        }

        // Owner always can view
        if (recording.streamerId === userId) {
            return { canView: true, price, purchased: true, lastStatus: 'owner' };
        }

        // Private allowed list override
        if (recording.isPrivate && Array.isArray(recording.allowedViewers) && recording.allowedViewers.includes(userId)) {
            return { canView: true, price, purchased: true, lastStatus: 'allowed' };
        }

        // Check purchase record
        const ok = await this.findUserSuccessfulPurchase(recordingId, userId);
        if (ok) return { canView: true, price, purchased: true, lastStatus: 'success' };

        let last = await this.purchaseModel.findOne({ recordingId, userId }).sort({ createdAt: -1 });

        // Self-heal: if last is pending and we have a checkoutRequestId, query STK status now
        if (last && last.status === 'pending' && last.orderTrackingId) {
            try {
                const data = await this.pesapalService.getTransactionStatus(last.orderTrackingId);
                const paymentStatus = (data?.payment_status_description || '').toString().trim().toLowerCase();
                if (paymentStatus === 'completed') {
                    // Mark purchase success
                    await this.purchaseModel.findOneAndUpdate(
                        { orderTrackingId: last.orderTrackingId },
                        { status: 'success', rawCallback: data },
                        { new: true },
                    );
                    return { canView: true, price, purchased: true, lastStatus: 'success' };
                }
            } catch (_) {
                // ignore query errors; fall through to default response
            }
        }

        last = last || undefined as any;
        return { canView: false, price, purchased: false, lastStatus: last?.status };
    }

    async getRecordingPlayback(recordingId: string, userId: string): Promise<{ url: string }> {
        const recording = await this.getRecordingById(recordingId);
        const access = await this.getRecordingAccess(recordingId, userId);
        if (!access.canView) {
            throw new ForbiddenException('Payment required');
        }
        if (!recording.recordingUrl) {
            throw new NotFoundException('Recording URL not available');
        }
        return { url: recording.recordingUrl };
    }

    async initiateRecordingPurchase(recordingId: string, phone: string, myUser: IUser) {
        const recording = await this.getRecordingById(recordingId);
        const price = recording.price ?? 0;
        if (!(price > 0)) {
            throw new BadRequestException('This recording is free');
        }
        // Prevent duplicate purchases if already purchased
        const existing = await this.findUserSuccessfulPurchase(recordingId, myUser._id);
        if (existing) {
            return { alreadyPurchased: true };
        }

        // Create purchase record (pending)
        const purchase = await this.purchaseModel.create({
            recordingId,
            userId: myUser._id,
            amount: price,
            status: 'pending',
        });

        // Initiate PesaPal payment
        const result = await this.pesapalService.submitOrder({
            userId: myUser._id,
            amount: price,
            currency: 'KES',
            description: `Recording ${recording.title ?? recordingId}`,
            accountReference: `REC-${recordingId}`,
        });

        // Link identifiers for callback correlation
        await this.purchaseModel.findByIdAndUpdate(purchase._id, {
            orderTrackingId: result.orderTrackingId,
            merchantReference: result.merchantReference,
        });

        return {
            purchaseId: purchase._id.toString(),
            orderTrackingId: result.orderTrackingId,
            redirectUrl: result.redirectUrl,
            merchantReference: result.merchantReference,
        };
    }

    async likeRecording(recordingId: string, userId: string): Promise<{ success: boolean; likesCount: number; isLiked: boolean }> {
        const recording = await this.recordingModel.findById(recordingId);
        if (!recording) {
            throw new NotFoundException('Recording not found');
        }

        // Check if user already liked the recording
        const hasLiked = recording.likedBy && recording.likedBy.includes(userId);

        if (hasLiked) {
            // Unlike the recording
            await this.recordingModel.findByIdAndUpdate(recordingId, {
                $pull: { likedBy: userId },
                $inc: { likesCount: -1 }
            });

            return {
                success: true,
                likesCount: recording.likesCount - 1,
                isLiked: false
            };
        } else {
            // Like the recording
            await this.recordingModel.findByIdAndUpdate(recordingId, {
                $addToSet: { likedBy: userId },
                $inc: { likesCount: 1 }
            });

            return {
                success: true,
                likesCount: recording.likesCount + 1,
                isLiked: true
            };
        }
    }

    async deleteRecording(recordingId: string, userId: string): Promise<{ success: boolean }> {
        const recording = await this.recordingModel.findById(recordingId);
        if (!recording) {
            throw new NotFoundException('Recording not found');
        }

        // Only the streamer can delete their recording
        if (recording.streamerId !== userId) {
            throw new ForbiddenException('Only the streamer can delete their recording');
        }

        await this.recordingModel.findByIdAndDelete(recordingId);

        return { success: true };
    }

    async incrementRecordingViews(recordingId: string): Promise<{ success: boolean; viewCount: number }> {
        const recording = await this.recordingModel.findByIdAndUpdate(
            recordingId,
            { $inc: { viewCount: 1 } },
            { new: true }
        );

        if (!recording) {
            throw new NotFoundException('Recording not found');
        }

        return {
            success: true,
            viewCount: recording.viewCount
        };
    }

    async updateRecordingPrivacy(
        recordingId: string,
        dto: UpdateRecordingPrivacyDto,
        userId: string
    ): Promise<ILiveStreamRecording> {
        const recording = await this.recordingModel.findById(recordingId);
        if (!recording) {
            throw new NotFoundException('Recording not found');
        }

        // Only the owner can update privacy
        if (recording.streamerId !== userId) {
            throw new ForbiddenException('Only the streamer can update recording privacy');
        }

        // Normalize inputs
        const isPrivate = dto.isPrivate ?? (Array.isArray(dto.allowedViewers) && dto.allowedViewers.length > 0);
        const allowed = Array.isArray(dto.allowedViewers) ? dto.allowedViewers.filter(Boolean) : [];

        if (!isPrivate) {
            // Everyone can see
            recording.isPrivate = false;
            recording.allowedViewers = [];
        } else {
            // Specific users
            recording.isPrivate = true;
            recording.allowedViewers = allowed;
        }

        await recording.save();
        return recording;
    }

    async updateRecordingPrice(
        recordingId: string,
        dto: UpdateRecordingPriceDto,
        userId: string
    ): Promise<ILiveStreamRecording> {
        const recording = await this.recordingModel.findById(recordingId);
        if (!recording) {
            throw new NotFoundException('Recording not found');
        }

        // Only streamer/owner can set price
        if (recording.streamerId !== userId) {
            throw new ForbiddenException('Only the streamer can update recording price');
        }

        const price = dto.price ?? 0;
        // Normalize negative numbers
        recording.price = price > 0 ? price : 0;
        await recording.save();
        return recording;
    }
}
