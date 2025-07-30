/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { AgoraService } from '../../chat/agora/agora.service';
import { SocketIoService } from '../../chat/socket_io/socket_io.service';
import { ILiveStream, ILiveStreamParticipant, ILiveStreamMessage, ILiveStreamJoinRequest, LiveStreamStatus, ParticipantRole } from './interfaces/live_stream.interface';
import { CreateLiveStreamDto, JoinLiveStreamDto, SendLiveStreamMessageDto, UpdateLiveStreamDto, LiveStreamFilterDto, RemoveParticipantDto, BanParticipantDto, RequestJoinStreamDto, RespondToJoinRequestDto, UpdateStreamFilterDto } from './dto/live_stream.dto';
import { IUser } from '../user_modules/user/entities/user.entity';
import { UserService } from '../user_modules/user/user.service';
import { NotificationEmitterService } from '../../common/notification_emitter/notification_emitter.service';
import { UserDeviceService } from '../user_modules/user_device/user_device.service';
import { NotificationData } from '../../common/notification_emitter/notification.event';
import { PushKeyAndProvider } from '../../core/utils/interfaceces';

@Injectable()
export class LiveStreamService {
    constructor(
        @InjectModel('LiveStream') private readonly liveStreamModel: Model<ILiveStream>,
        @InjectModel('LiveStreamParticipant') private readonly participantModel: Model<ILiveStreamParticipant>,
        @InjectModel('LiveStreamMessage') private readonly messageModel: Model<ILiveStreamMessage>,
        @InjectModel('LiveStreamJoinRequest') private readonly joinRequestModel: Model<ILiveStreamJoinRequest>,
        private readonly agoraService: AgoraService,
        private readonly socketService: SocketIoService,
        private readonly userService: UserService,
        private readonly notificationEmitterService: NotificationEmitterService,
        private readonly userDeviceService: UserDeviceService,
    ) {}

    async createLiveStream(dto: CreateLiveStreamDto): Promise<ILiveStream> {
        // Generate unique channel name
        const channelName = `live_${uuidv4().replace(/-/g, '')}`;
        
        // Get Agora token for the channel
        const agoraAccess = this.agoraService.getAgoraAccessNew(channelName, true);

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
        if (!stream.isPrivate && stream.requiresApproval && stream.streamerId !== dto.myUser._id) {
            // Check if user has an approved join request
            const approvedRequest = await this.joinRequestModel.findOne({
                streamId: dto.streamId,
                userId: dto.myUser._id,
                status: 'approved'
            });

            if (!approvedRequest) {
                throw new ForbiddenException('You need approval from the host to join this stream. Please request to join first.');
            }
        }

        // Check if user is already a participant
        let participant = await this.participantModel.findOne({
            streamId: dto.streamId,
            userId: dto.myUser._id
        });

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
                role: ParticipantRole.VIEWER,
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

        // Auto-claim gift for the host if this is a gift message
        if (dto.messageType === 'gift' && dto.giftData && dto.giftData.giftPrice) {
            try {
                // Generate unique gift message ID for claiming
                const giftMessageId = `live_stream_${message._id}`;

                // Add gift to host's claimed gifts and update balance
                await this.userService.addClaimedGift(stream.streamerId, giftMessageId);
                await this.userService.addToBalance(stream.streamerId, dto.giftData.giftPrice);

                // Emit a special event to notify the host about the auto-claimed gift
                this.socketService.io.to(stream.streamerId).emit('gift_auto_claimed', {
                    streamId: streamId,
                    giftData: dto.giftData,
                    senderName: dto.myUser.fullName,
                    message: `Received a gift worth $${dto.giftData.giftPrice.toFixed(2)} from ${dto.myUser.fullName}!`
                });
            } catch (error) {
                console.error('Error auto-claiming gift for host:', error);
                // Don't throw error here to avoid breaking the message sending
            }
        }

        // Emit socket event
        this.socketService.io.to(streamId).emit('new_stream_message', message);

        return message;
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

        if (!stream.requiresApproval) {
            throw new BadRequestException('This stream does not require approval. You can join directly.');
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

        // Notify the requester via socket
        this.socketService.io.to(joinRequest.userId).emit('join_request_response', {
            requestId: dto.requestId,
            streamId: joinRequest.streamId,
            status: joinRequest.status,
            streamTitle: stream.title,
            message: dto.action === 'approve'
                ? 'Your join request has been approved! You can now join the stream.'
                : 'Your join request has been denied.'
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

    /**
     * Send push notifications to all users when someone starts live streaming
     */
    private async sendLiveStreamNotification(stream: ILiveStream): Promise<void> {
        try {
            // Get all users except the streamer
            const allUsers = await this.userService.findAll(
                {
                    _id: { $ne: stream.streamerId },
                    deletedAt: null
                },
                '_id'
            );

            // Collect all push tokens
            const tokens = new PushKeyAndProvider([], [], []);

            for (const user of allUsers) {
                const userTokens = await this.userDeviceService.getUserPushTokens(user._id.toString());
                console.log(`User ${user._id} tokens:`, { fcm: userTokens.fcm.length, oneSignal: userTokens.oneSignal.length });
                tokens.fcm.push(...userTokens.fcm);
                tokens.oneSignal.push(...userTokens.oneSignal);
            }

            // Send FCM notifications
            if (tokens.fcm.length > 0) {
                const fcmNotificationData = new NotificationData({
                    tokens: tokens.fcm,
                    title: `${stream.streamerData.fullName} is live`,
                    body: stream.title || 'Join the live stream now!',
                    tag: 'live_stream',
                    data: {
                        type: 'live_stream',
                        streamId: stream._id.toString(),
                        streamerId: stream.streamerId.toString(),
                        streamerName: stream.streamerData.fullName,
                        title: stream.title || '',
                        fromVChat: 'false' // Mark as non-VChat notification
                    }
                });
                await this.notificationEmitterService.fcmSend(fcmNotificationData);
            }

            // Send OneSignal notifications
            if (tokens.oneSignal.length > 0) {
                const oneSignalNotificationData = new NotificationData({
                    tokens: tokens.oneSignal,
                    title: `${stream.streamerData.fullName} is live`,
                    body: stream.title || 'Join the live stream now!',
                    tag: 'live_stream',
                    data: {
                        type: 'live_stream',
                        streamId: stream._id.toString(),
                        streamerId: stream.streamerId.toString(),
                        streamerName: stream.streamerData.fullName,
                        title: stream.title || '',
                        fromVChat: 'false' // Mark as non-VChat notification
                    }
                });
                await this.notificationEmitterService.oneSignalSend(oneSignalNotificationData);
            }

            console.log(`Live stream notification sent to ${tokens.fcm.length + tokens.oneSignal.length} devices for stream: ${stream.title}`);
            console.log(`Total tokens collected - FCM: ${tokens.fcm.length}, OneSignal: ${tokens.oneSignal.length}`);
        } catch (error) {
            console.error('Error sending live stream notification:', error);
            // Don't throw error to avoid breaking the live stream start process
        }
    }
}
