/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {
    Controller,
    Get,
    Post,
    Put,
    Body,
    Param,
    Query,
    Req,
    Delete,
    BadRequestException,
    UseGuards,
    UseInterceptors,
    UploadedFile
} from '@nestjs/common';
// import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { VerifiedAuthGuard } from '../../core/guards/verified.auth.guard';
import { V1Controller } from '../../core/common/v1-controller.decorator';
import { resOK } from '../../core/utils/res.helpers';
import { MongoIdDto } from '../../core/common/dto/mongo.id.dto';
import { LiveStreamService } from './live_stream.service';
import {
    CreateLiveStreamDto,
    JoinLiveStreamDto,
    SendLiveStreamMessageDto,
    UpdateLiveStreamDto,
    LiveStreamFilterDto,
    RemoveParticipantDto,
    BanParticipantDto,
    RequestJoinStreamDto,
    RespondToJoinRequestDto,
    InviteUserToStreamDto,
    RespondToInviteDto,
    UpdateStreamFilterDto,
    StartRecordingDto,
    StopRecordingDto,
    RecordingFilterDto
} from './dto/live_stream.dto';
import { InitiateRecordingPurchaseDto } from './dto/recording_purchase.dto';

@UseGuards(VerifiedAuthGuard)
@V1Controller('live-stream')
export class LiveStreamController {
    constructor(private readonly liveStreamService: LiveStreamService) {}

    @Post()
    @UseInterceptors(FileInterceptor('thumbnail'))
    async createLiveStream(
        @Body() dto: CreateLiveStreamDto,
        @Req() req: any,
        @UploadedFile() file?: Express.Multer.File
    ) {
        dto.myUser = req.user;
        
        // Handle thumbnail upload if provided
        if (file) {
            // You can implement S3 upload here similar to other parts of your app
            // dto.thumbnailUrl = await this.s3Service.uploadFile(file);
        }

        const stream = await this.liveStreamService.createLiveStream(dto);
        return resOK(stream);
    }

    @Post(':id([0-9a-fA-F]{24})/start')
    async startLiveStream(@Param() params: MongoIdDto, @Req() req: any) {
        const stream = await this.liveStreamService.startLiveStream(params.id, req.user._id);
        return resOK(stream);
    }

    @Post(':id([0-9a-fA-F]{24})/end')
    async endLiveStream(@Param() params: MongoIdDto, @Req() req: any) {
        const stream = await this.liveStreamService.endLiveStream(params.id, req.user._id);
        return resOK(stream);
    }

    @Post(':id([0-9a-fA-F]{24})/join')
    async joinLiveStream(@Param() params: MongoIdDto, @Req() req: any) {
        const dto: JoinLiveStreamDto = {
            streamId: params.id,
            myUser: req.user
        };
        const result = await this.liveStreamService.joinLiveStream(dto);
        return resOK(result);
    }

    @Post(':id([0-9a-fA-F]{24})/leave')
    async leaveLiveStream(@Param() params: MongoIdDto, @Req() req: any) {
        await this.liveStreamService.leaveLiveStream(params.id, req.user._id);
        return resOK({ message: 'Left stream successfully' });
    }

    @Post(':id([0-9a-fA-F]{24})/message')
    async sendMessage(
        @Param() params: MongoIdDto,
        @Body() dto: SendLiveStreamMessageDto,
        @Req() req: any
    ) {
        dto.myUser = req.user;
        const message = await this.liveStreamService.sendMessage(params.id, dto);
        return resOK(message);
    }

    // Gift purchase (STK)
    @Post(':id([0-9a-fA-F]{24})/gift/:giftId([0-9a-fA-F]{24})/purchase')
    async initiateGiftPurchase(
        @Param('id') streamId: string,
        @Param('giftId') giftId: string,
        @Body() body: { phone: string },
        @Req() req: any,
    ) {
        const result = await this.liveStreamService.initiateGiftPurchase({ streamId, giftId, phone: body.phone, user: req.user });
        return resOK(result);
    }

    @Get(':id([0-9a-fA-F]{24})/gift/:giftId([0-9a-fA-F]{24})/purchase/status')
    async getGiftPurchaseStatus(
        @Param('id') streamId: string,
        @Param('giftId') giftId: string,
        @Req() req: any,
    ) {
        const result = await this.liveStreamService.getGiftPurchaseStatus(streamId, giftId, req.user._id);
        return resOK(result);
    }

    // Support donation (STK)
    @Post(':id([0-9a-fA-F]{24})/support')
    async initiateSupportDonation(
        @Param('id') streamId: string,
        @Body() body: { amount: number; phone: string },
        @Req() req: any,
    ) {
        const result = await this.liveStreamService.initiateSupportDonation({ streamId, amount: body.amount, phone: body.phone, user: req.user });
        return resOK(result);
    }

    @Get(':id([0-9a-fA-F]{24})/support/:donationId([0-9a-fA-F]{24})/status')
    async getSupportDonationStatus(
        @Param('id') streamId: string,
        @Param('donationId') donationId: string,
        @Req() req: any,
    ) {
        const result = await this.liveStreamService.getSupportDonationStatus(streamId, donationId, req.user._id);
        return resOK(result);
    }

    @Post(':id([0-9a-fA-F]{24})/filter')
    async updateStreamFilter(
        @Param() params: MongoIdDto,
        @Body() dto: UpdateStreamFilterDto,
        @Req() req: any
    ) {
        dto.myUser = req.user;
        const result = await this.liveStreamService.updateStreamFilter(params.id, dto);
        return resOK(result);
    }

    @Get()
    async getLiveStreams(@Query() filter: LiveStreamFilterDto, @Req() req: any) {
        const result = await this.liveStreamService.getLiveStreams(filter, req.user._id);
        return resOK(result);
    }

    @Get('categories')
    async getLiveCategories() {
        const categories = await this.liveStreamService.getLiveCategories();
        return resOK(categories);
    }

    // Recordings endpoints - place BEFORE dynamic ':id' routes to prevent matching issues
    @Get('recordings')
    async getRecordings(
        @Query() filter: RecordingFilterDto,
        @Query('scope') scope: 'all' | 'me' | undefined,
        @Req() req: any
    ) {
        const userId = req.user?._id;
        // When scope=all, return public recordings plus any private ones the user can access
        if (scope === 'all') {
            const result = await this.liveStreamService.getRecordings(filter, userId);
            return resOK(result);
        }

        // Default behaviour: require auth and return user's own recordings
        if (!userId) {
            throw new BadRequestException('User not authenticated');
        }

        const page = filter?.page ?? 1;
        const limit = filter?.limit ?? 20;
        const result = await this.liveStreamService.getUserRecordings(userId, page, limit);
        return resOK(result);
    }

    @Get('recordings/:recordingId([0-9a-fA-F]{24})')
    async getRecordingById(@Param('recordingId') recordingId: string) {
        const recording = await this.liveStreamService.getRecordingById(recordingId);
        return resOK(recording);
    }

    // Paid recordings - access status
    @Get('recordings/:recordingId([0-9a-fA-F]{24})/access')
    async getRecordingAccess(@Param('recordingId') recordingId: string, @Req() req: any) {
        const result = await this.liveStreamService.getRecordingAccess(recordingId, req.user._id);
        return resOK(result);
    }

    // Paid recordings - initiate purchase (STK)
    @Post('recordings/:recordingId([0-9a-fA-F]{24})/purchase')
    async initiateRecordingPurchase(
        @Param('recordingId') recordingId: string,
        @Body() body: InitiateRecordingPurchaseDto,
        @Req() req: any,
    ) {
        const result = await this.liveStreamService.initiateRecordingPurchase(recordingId, body.phone, req.user);
        return resOK(result);
    }

    // Paid recordings - playback URL (checks access internally)
    @Get('recordings/:recordingId([0-9a-fA-F]{24})/playback')
    async getRecordingPlayback(@Param('recordingId') recordingId: string, @Req() req: any) {
        const result = await this.liveStreamService.getRecordingPlayback(recordingId, req.user._id);
        return resOK(result);
    }

    // Singular alias
    @Get('recording/:recordingId([0-9a-fA-F]{24})')
    async getRecordingByIdAlias(@Param('recordingId') recordingId: string) {
        const recording = await this.liveStreamService.getRecordingById(recordingId);
        return resOK(recording);
    }

    @Post('recordings/:recordingId([0-9a-fA-F]{24})/like')
    async likeRecording(@Param('recordingId') recordingId: string, @Req() req: any) {
        const result = await this.liveStreamService.likeRecording(recordingId, req.user._id);
        return resOK(result);
    }

    // Singular alias
    @Post('recording/:recordingId([0-9a-fA-F]{24})/like')
    async likeRecordingAlias(@Param('recordingId') recordingId: string, @Req() req: any) {
        const result = await this.liveStreamService.likeRecording(recordingId, req.user._id);
        return resOK(result);
    }

    @Delete('recordings/:recordingId([0-9a-fA-F]{24})')
    async deleteRecording(@Param('recordingId') recordingId: string, @Req() req: any) {
        const result = await this.liveStreamService.deleteRecording(recordingId, req.user._id);
        return resOK(result);
    }

    // Singular alias
    @Delete('recording/:recordingId([0-9a-fA-F]{24})')
    async deleteRecordingAlias(@Param('recordingId') recordingId: string, @Req() req: any) {
        const result = await this.liveStreamService.deleteRecording(recordingId, req.user._id);
        return resOK(result);
    }

    @Post('recordings/:recordingId([0-9a-fA-F]{24})/view')
    async incrementRecordingViews(@Param('recordingId') recordingId: string) {
        const result = await this.liveStreamService.incrementRecordingViews(recordingId);
        return resOK(result);
    }

    // Singular alias
    @Post('recording/:recordingId([0-9a-fA-F]{24})/view')
    async incrementRecordingViewsAlias(@Param('recordingId') recordingId: string) {
        const result = await this.liveStreamService.incrementRecordingViews(recordingId);
        return resOK(result);
    }

    // Update recording privacy (public vs specific users)
    @Put('recordings/:recordingId([0-9a-fA-F]{24})/privacy')
    async updateRecordingPrivacy(
        @Param('recordingId') recordingId: string,
        @Body() body: { isPrivate?: boolean; allowedViewers?: string[] },
        @Req() req: any,
    ) {
        const result = await this.liveStreamService.updateRecordingPrivacy(
            recordingId,
            { isPrivate: body.isPrivate, allowedViewers: body.allowedViewers, myUser: req.user },
            req.user._id,
        );
        return resOK(result);
    }

    // Update recording price (0 or undefined => free)
    @Put('recordings/:recordingId([0-9a-fA-F]{24})/price')
    async updateRecordingPrice(
        @Param('recordingId') recordingId: string,
        @Body() body: { price?: number },
        @Req() req: any,
    ) {
        const result = await this.liveStreamService.updateRecordingPrice(
            recordingId,
            { price: body?.price, myUser: req.user },
            req.user._id,
        );
        return resOK(result);
    }

    @Get(':id([0-9a-fA-F]{24})')
    async getStreamById(@Param() params: MongoIdDto) {
        const stream = await this.liveStreamService.getStreamById(params.id);
        return resOK(stream);
    }

    @Get(':id([0-9a-fA-F]{24})/messages')
    async getStreamMessages(
        @Param() params: MongoIdDto,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 50
    ) {
        const messages = await this.liveStreamService.getStreamMessages(params.id, page, limit);
        return resOK(messages);
    }

    @Get(':id([0-9a-fA-F]{24})/participants')
    async getStreamParticipants(@Param() params: MongoIdDto) {
        const participants = await this.liveStreamService.getStreamParticipants(params.id);
        return resOK(participants);
    }

    @Post(':streamId([0-9a-fA-F]{24})/message/:messageId([0-9a-fA-F]{24})/pin')
    async pinMessage(
        @Param('streamId') streamId: string,
        @Param('messageId') messageId: string,
        @Req() req: any
    ) {
        const result = await this.liveStreamService.pinMessage(streamId, messageId, req.user._id);
        return resOK(result);
    }

    @Delete(':streamId([0-9a-fA-F]{24})/message/:messageId([0-9a-fA-F]{24})/pin')
    async unpinMessage(
        @Param('streamId') streamId: string,
        @Param('messageId') messageId: string,
        @Req() req: any
    ) {
        const result = await this.liveStreamService.unpinMessage(streamId, messageId, req.user._id);
        return resOK(result);
    }

    @Get(':id([0-9a-fA-F]{24})/pinned-message')
    async getPinnedMessage(@Param() params: MongoIdDto) {
        const message = await this.liveStreamService.getPinnedMessage(params.id);
        return resOK(message);
    }

    @Put(':id([0-9a-fA-F]{24})')
    async updateLiveStream(
        @Param() params: MongoIdDto,
        @Body() dto: UpdateLiveStreamDto,
        @Req() req: any
    ) {
        dto.myUser = req.user;
        // Implementation for updating stream details
        return resOK({ message: 'Stream updated successfully' });
    }

    @Delete(':id([0-9a-fA-F]{24})')
    async deleteLiveStream(@Param() params: MongoIdDto, @Req() req: any) {
        // Implementation for deleting/cancelling stream
        return resOK({ message: 'Stream deleted successfully' });
    }

    @Post(':id([0-9a-fA-F]{24})/remove-participant')
    async removeParticipant(
        @Param() params: MongoIdDto,
        @Body() dto: RemoveParticipantDto,
        @Req() req: any
    ) {
        dto.myUser = req.user;
        const result = await this.liveStreamService.removeParticipant(params.id, dto);
        return resOK(result);
    }

    @Post(':id([0-9a-fA-F]{24})/ban-participant')
    async banParticipant(
        @Param() params: MongoIdDto,
        @Body() dto: BanParticipantDto,
        @Req() req: any
    ) {
        dto.myUser = req.user;
        const result = await this.liveStreamService.banParticipant(params.id, dto);
        return resOK(result);
    }

    @Post(':id([0-9a-fA-F]{24})/like')
    async likeStream(@Param() params: MongoIdDto, @Req() req: any) {
        const result = await this.liveStreamService.likeStream(params.id, req.user._id);
        return resOK(result);
    }

    @Get(':id([0-9a-fA-F]{24})/likes')
    async getStreamLikes(@Param() params: MongoIdDto) {
        const result = await this.liveStreamService.getStreamLikes(params.id);
        return resOK(result);
    }

    @Post(':id([0-9a-fA-F]{24})/request-join')
    async requestJoinStream(
        @Param() params: MongoIdDto,
        @Body() body: { requestType?: 'viewer' | 'cohost'; age?: number; amountPaid?: number },
        @Req() req: any,
    ) {
        const dto: RequestJoinStreamDto = {
            streamId: params.id,
            requestType: body?.requestType,
            age: body?.age,
            amountPaid: body?.amountPaid,
            myUser: req.user
        };
        const result = await this.liveStreamService.requestJoinStream(dto);
        return resOK(result);
    }

    @Post('join-request/:requestId/respond')
    async respondToJoinRequest(
        @Param('requestId') requestId: string,
        @Body() body: { action: 'approve' | 'deny' },
        @Req() req: any
    ) {
        const dto: RespondToJoinRequestDto = {
            requestId: requestId,
            action: body.action,
            myUser: req.user
        };
        const result = await this.liveStreamService.respondToJoinRequest(dto);
        return resOK(result);
    }

    @Get(':id([0-9a-fA-F]{24})/join-requests')
    async getJoinRequests(@Param() params: MongoIdDto, @Req() req: any) {
        const result = await this.liveStreamService.getJoinRequests(params.id, req.user._id);
        return resOK(result);
    }

    // Host invite endpoints
    @Post(':id([0-9a-fA-F]{24})/invite')
    async inviteUserToStream(
        @Param() params: MongoIdDto,
        @Body() body: { userId: string; requestType?: 'viewer' | 'cohost' },
        @Req() req: any,
    ) {
        const dto: InviteUserToStreamDto = {
            streamId: params.id,
            userId: body.userId,
            requestType: body?.requestType,
            myUser: req.user,
        };
        const result = await this.liveStreamService.inviteUserToStream(dto);
        return resOK(result);
    }

    @Post('invite/:requestId/respond')
    async respondToInvite(
        @Param('requestId') requestId: string,
        @Body() body: { action: 'accept' | 'reject' },
        @Req() req: any,
    ) {
        const dto: RespondToInviteDto = {
            requestId,
            action: body.action,
            myUser: req.user,
        };
        const result = await this.liveStreamService.respondToInvite(dto);
        return resOK(result);
    }

    // Recording endpoints
    @Post(':id([0-9a-fA-F]{24})/start-recording')
    async startRecording(
        @Param() params: MongoIdDto,
        @Body() dto: StartRecordingDto,
        @Req() req: any
    ) {
        dto.streamId = params.id;
        dto.myUser = req.user;
        const result = await this.liveStreamService.startRecording(dto);
        return resOK(result);
    }

    @Post(':id([0-9a-fA-F]{24})/stop-recording')
    async stopRecording(
        @Param() params: MongoIdDto,
        @Body() dto: StopRecordingDto,
        @Req() req: any
    ) {
        dto.streamId = params.id;
        dto.myUser = req.user;
        const result = await this.liveStreamService.stopRecording(dto);
        return resOK(result);
    }


}
