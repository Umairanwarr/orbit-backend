/**
 * Community controller
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Delete,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { V1Controller } from '../../core/common/v1-controller.decorator';
import { VerifiedAuthGuard } from '../../core/guards/verified.auth.guard';
import { CommunityService } from './community.service';
import { CreateCommunityDto } from './dto/create_community.dto';
import { imageFileInterceptor } from '../../core/utils/upload_interceptors';
import { resOK } from '../../core/utils/res.helpers';

@UseGuards(VerifiedAuthGuard)
@V1Controller('community')
export class CommunityController {
  constructor(private readonly service: CommunityService) {}

  @UseInterceptors(imageFileInterceptor)
  @Post()
  async createCommunity(@Req() req: any, @Body() dto: CreateCommunityDto, @UploadedFile() file?: any) {
    dto.myUser = req.user;
    if (file) dto.imageBuffer = file.buffer;
    try {
      if (dto.extraData) dto.extraData = JSON.parse(dto.extraData as any);
    } catch {}
    return resOK(await this.service.createCommunity(dto));
  }

  @Get('mine')
  async getMyCommunities(@Req() req: any) {
    return resOK(await this.service.getMyCommunities(req.user._id));
  }

  @Get(':communityId')
  async getCommunity(@Param('communityId') cId: string) {
    return resOK(await this.service.getCommunity(cId));
  }

  @Get(':communityId/members')
  async getMembers(
    @Param('communityId') cId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return resOK(await this.service.getMembers(cId, parseInt(page || '1', 10), parseInt(limit || '30', 10), search));
  }

  @Get(':communityId/requests')
  async getRequests(
    @Param('communityId') cId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return resOK(await this.service.getPendingRequests(cId, parseInt(page || '1', 10), parseInt(limit || '30', 10), search));
  }

  @Post(':communityId/members')
  async addMembers(@Req() req: any, @Param('communityId') cId: string, @Body('ids') ids: string[]) {
    return resOK(await this.service.addMembers(cId, req.user._id, Array.isArray(ids) ? ids : []));
  }

  @Post(':communityId/join')
  async join(@Req() req: any, @Param('communityId') cId: string) {
    return resOK(await this.service.joinCommunity(cId, req.user._id));
  }

  @Post(':communityId/requests/:targetId/:action')
  async respond(
    @Req() req: any,
    @Param('communityId') cId: string,
    @Param('targetId') targetId: string,
    @Param('action') action: string,
  ) {
    return resOK(await this.service.respondJoinRequest(cId, req.user._id, targetId, action === 'approve'));
  }

  @Get(':communityId/groups')
  async groups(@Param('communityId') cId: string) {
    return resOK(await this.service.getCommunityGroups(cId));
  }

  @Get(':communityId/role')
  async myRole(@Req() req: any, @Param('communityId') cId: string) {
    return resOK(await this.service.getMyRole(cId, req.user._id));
  }

  @UseInterceptors(imageFileInterceptor)
  @Post(':communityId/groups')
  async createGroup(
    @Req() req: any,
    @Param('communityId') cId: string,
    @Body('groupName') groupName: string,
    @Body('peerIds') peerIds: any,
    @Body('groupDescription') groupDescription?: string,
    @Body('extraData') extraData?: any,
    @UploadedFile() file?: any,
  ) {
    if (!groupName) throw new BadRequestException('groupName is required');
    try { peerIds = JSON.parse(peerIds); } catch {}
    try { if (extraData) extraData = JSON.parse(extraData); } catch {}
    return resOK(
      await this.service.createGroupInCommunity(cId, {
        groupName,
        peerIds: Array.isArray(peerIds) ? peerIds : [],
        groupDescription,
        extraData,
        myUser: req.user,
        imageBuffer: file ? file.buffer : undefined,
      }),
    );
  }

  @Get('my/announcements')
  async listMyAnnouncements(@Req() req: any, @Query('page') page?: string, @Query('limit') limit?: string) {
    return resOK(await this.service.listMyAnnouncements(req.user._id, parseInt(page || '1', 10), parseInt(limit || '20', 10)));
  }

  @Get(':communityId/announcements')
  async listAnnouncements(
    @Param('communityId') cId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return resOK(await this.service.getAnnouncements(cId, parseInt(page || '1', 10), parseInt(limit || '20', 10)));
  }

  @Post(':communityId/announcements')
  async createAnnouncement(
    @Req() req: any,
    @Param('communityId') cId: string,
    @Body() body: any,
  ) {
    try { if (typeof body === 'string') body = JSON.parse(body); } catch {}
    const data = {
      title: body?.title,
      content: body?.content,
      pinned: body?.pinned === true || body?.pinned === 'true',
    } as any;
    return resOK(await this.service.createAnnouncement(cId, req.user, data));
  }

  @Delete(':communityId/announcements/:id')
  async deleteAnnouncement(
    @Req() req: any,
    @Param('communityId') cId: string,
    @Param('id') id: string,
  ) {
    return resOK(await this.service.deleteAnnouncement(cId, req.user._id, id));
  }

  @Patch(':communityId/extra')
  async updateExtra(@Req() req: any, @Param('communityId') cId: string, @Body() data: any) {
    try { data = JSON.parse(data); } catch {}
    return resOK(await this.service.updateExtraData(cId, req.user._id, data));
  }

  @UseInterceptors(imageFileInterceptor)
  @Patch(':communityId/image')
  async updateImage(@Req() req: any, @Param('communityId') cId: string, @UploadedFile() file?: any) {
    if (!file) throw new BadRequestException('image is required');
    return resOK(await this.service.updateImage(cId, req.user._id, file));
  }

  @Post(':communityId/attach/:roomId')
  async attachExistingGroup(
    @Req() req: any,
    @Param('communityId') cId: string,
    @Param('roomId') roomId: string,
  ) {
    // Only community admins/owners can attach groups
    await this.service.assertAdmin(cId, req.user._id);
    return resOK(await this.service.attachExistingGroup(cId, roomId));
  }
}
