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
    Delete,
    Body,
    Param,
    Query,
    Req,
    UseGuards,
    UseInterceptors,
    UploadedFile
} from '@nestjs/common';
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
    UpdateStreamFilterDto
} from './dto/live_stream.dto';

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

    @Post(':id/start')
    async startLiveStream(@Param() params: MongoIdDto, @Req() req: any) {
        const stream = await this.liveStreamService.startLiveStream(params.id, req.user._id);
        return resOK(stream);
    }

    @Post(':id/end')
    async endLiveStream(@Param() params: MongoIdDto, @Req() req: any) {
        const stream = await this.liveStreamService.endLiveStream(params.id, req.user._id);
        return resOK(stream);
    }

    @Post(':id/join')
    async joinLiveStream(@Param() params: MongoIdDto, @Req() req: any) {
        const dto: JoinLiveStreamDto = {
            streamId: params.id,
            myUser: req.user
        };
        const result = await this.liveStreamService.joinLiveStream(dto);
        return resOK(result);
    }

    @Post(':id/leave')
    async leaveLiveStream(@Param() params: MongoIdDto, @Req() req: any) {
        await this.liveStreamService.leaveLiveStream(params.id, req.user._id);
        return resOK({ message: 'Left stream successfully' });
    }

    @Post(':id/message')
    async sendMessage(
        @Param() params: MongoIdDto,
        @Body() dto: SendLiveStreamMessageDto,
        @Req() req: any
    ) {
        dto.myUser = req.user;
        const message = await this.liveStreamService.sendMessage(params.id, dto);
        return resOK(message);
    }

    @Post(':id/filter')
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

    @Get(':id')
    async getStreamById(@Param() params: MongoIdDto) {
        const stream = await this.liveStreamService.getStreamById(params.id);
        return resOK(stream);
    }

    @Get(':id/messages')
    async getStreamMessages(
        @Param() params: MongoIdDto,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 50
    ) {
        const messages = await this.liveStreamService.getStreamMessages(params.id, page, limit);
        return resOK(messages);
    }

    @Get(':id/participants')
    async getStreamParticipants(@Param() params: MongoIdDto) {
        const participants = await this.liveStreamService.getStreamParticipants(params.id);
        return resOK(participants);
    }

    @Post(':streamId/message/:messageId/pin')
    async pinMessage(
        @Param('streamId') streamId: string,
        @Param('messageId') messageId: string,
        @Req() req: any
    ) {
        const result = await this.liveStreamService.pinMessage(streamId, messageId, req.user._id);
        return resOK(result);
    }

    @Delete(':streamId/message/:messageId/pin')
    async unpinMessage(
        @Param('streamId') streamId: string,
        @Param('messageId') messageId: string,
        @Req() req: any
    ) {
        const result = await this.liveStreamService.unpinMessage(streamId, messageId, req.user._id);
        return resOK(result);
    }

    @Get(':id/pinned-message')
    async getPinnedMessage(@Param() params: MongoIdDto) {
        const message = await this.liveStreamService.getPinnedMessage(params.id);
        return resOK(message);
    }

    @Put(':id')
    async updateLiveStream(
        @Param() params: MongoIdDto,
        @Body() dto: UpdateLiveStreamDto,
        @Req() req: any
    ) {
        dto.myUser = req.user;
        // Implementation for updating stream details
        return resOK({ message: 'Stream updated successfully' });
    }

    @Delete(':id')
    async deleteLiveStream(@Param() params: MongoIdDto, @Req() req: any) {
        // Implementation for deleting/cancelling stream
        return resOK({ message: 'Stream deleted successfully' });
    }

    @Post(':id/remove-participant')
    async removeParticipant(
        @Param() params: MongoIdDto,
        @Body() dto: RemoveParticipantDto,
        @Req() req: any
    ) {
        dto.myUser = req.user;
        const result = await this.liveStreamService.removeParticipant(params.id, dto);
        return resOK(result);
    }

    @Post(':id/ban-participant')
    async banParticipant(
        @Param() params: MongoIdDto,
        @Body() dto: BanParticipantDto,
        @Req() req: any
    ) {
        dto.myUser = req.user;
        const result = await this.liveStreamService.banParticipant(params.id, dto);
        return resOK(result);
    }

    @Post(':id/like')
    async likeStream(@Param() params: MongoIdDto, @Req() req: any) {
        const result = await this.liveStreamService.likeStream(params.id, req.user._id);
        return resOK(result);
    }

    @Get(':id/likes')
    async getStreamLikes(@Param() params: MongoIdDto) {
        const result = await this.liveStreamService.getStreamLikes(params.id);
        return resOK(result);
    }

    @Post(':id/request-join')
    async requestJoinStream(@Param() params: MongoIdDto, @Req() req: any) {
        const dto: RequestJoinStreamDto = {
            streamId: params.id,
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

    @Get(':id/join-requests')
    async getJoinRequests(@Param() params: MongoIdDto, @Req() req: any) {
        const result = await this.liveStreamService.getJoinRequests(params.id, req.user._id);
        return resOK(result);
    }
}
