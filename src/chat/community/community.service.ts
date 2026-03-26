/**
 * Community service
 */
import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, PaginateModel, QueryOptions } from 'mongoose';
import { ICommunity } from './entities/community.entity';
import { CommunityMemberStatus, CommunityRoleType, ICommunityMember } from './entities/community_member.entity';
import { FileUploaderService } from '../../common/file_uploader/file_uploader.service';
import { AppConfigService } from '../../api/app_config/app_config.service';
import { IAppConfig } from '../../api/app_config/entities/app_config.entity';
import { CreateCommunityDto } from './dto/create_community.dto';
import { UserService } from '../../api/user_modules/user/user.service';
import { GroupSettingsService } from '../group_settings/group_settings.service';
import { GroupChannelService } from '../channel/services/group.channel.service';
import { RoomMemberService } from '../room_member/room_member.service';
import { ICommunityAnnouncement } from './entities/community_announcement.entity';

@Injectable()
export class CommunityService {
  constructor(
    @InjectModel('community') private readonly communityModel: Model<ICommunity>,
    @InjectModel('community_member') private readonly memberModel: PaginateModel<ICommunityMember>,
    @InjectModel('community_announcement') private readonly announcementModel: PaginateModel<ICommunityAnnouncement>,
    private readonly s3: FileUploaderService,
    private readonly appConfig: AppConfigService,
    private readonly userService: UserService,
    private readonly groupSettings: GroupSettingsService,
    private readonly groupChannel: GroupChannelService,
    private readonly roomMember: RoomMemberService,
  ) {}

  async createCommunity(dto: CreateCommunityDto): Promise<ICommunity> {
    let config: IAppConfig = await this.appConfig.getConfig();
    let imgUrl = config.groupIcon; // reuse group icon as default
    if (dto.imageBuffer) {
      imgUrl = await this.s3.putImageCropped(dto.imageBuffer, dto.myUser._id);
      dto.imageBuffer = undefined as any;
    }

    const created = await this.communityModel.create({
      cId: dto.myUser._id,
      name: dto.name,
      desc: dto.desc || null,
      img: imgUrl,
      extraData: dto.extraData || { joinMode: 'approval', allowMembersInvite: false },
    });

    // Add creator as Owner
    const u = await this.userService.findByIdOrThrow(dto.myUser._id, 'fullName fullNameEn userImage');
    await this.memberModel.create({
      uId: dto.myUser._id,
      cId: created._id,
      role: CommunityRoleType.Owner,
      status: CommunityMemberStatus.Active,
      userData: {
        _id: u._id,
        fullName: u.fullName,
        fullNameEn: u.fullNameEn,
        userImage: u.userImage,
      },
    } as any);

    return created;
  }

  async assertAdmin(cId: string, uId: string): Promise<ICommunityMember> {
    const cm = await this.memberModel.findOne({ cId, uId });
    if (!cm || cm.status !== CommunityMemberStatus.Active) throw new ForbiddenException('Not a member');
    if (cm.role !== CommunityRoleType.Owner && cm.role !== CommunityRoleType.Admin) {
      throw new ForbiddenException('Admin only');
    }
    return cm;
  }

  private async getUserCommunityIds(uId: string): Promise<string[]> {
    const memberships = await this.memberModel.find({ uId, status: CommunityMemberStatus.Active }, 'cId').lean();
    const idsFromMembership = memberships.map((m: any) => m.cId?.toString()).filter(Boolean);
    // Distinct room ids the user belongs to (exclude only explicitly deleted)
    const roomIdsRaw = (await this.roomMember.findAll({ uId, isD: { $ne: true } } as any, 'rId', undefined as any, true)) as any[];
    const roomIds = (roomIdsRaw || []).map((id: any) => id?.toString()).filter((v: any) => !!v);
    let idsFromGroups: string[] = [];
    if (roomIds && (roomIds as any[]).length) {
      // Match by either _id or rId depending on schema/version
      const gsList = await this.groupSettings.findAll({
        $and: [
          { communityId: { $exists: true, $ne: null } },
          { $or: [{ _id: { $in: roomIds } as any }, { rId: { $in: roomIds } as any }] },
        ],
      } as any, 'communityId', undefined as any);
      idsFromGroups = (gsList as any[])
        .map((g: any) => g?.communityId?.toString())
        .filter((v: any) => !!v);
    }
    return Array.from(new Set([...(idsFromMembership as string[]), ...idsFromGroups]));
  }

  async getMyCommunities(uId: string) {
    const ids = await this.getUserCommunityIds(uId);
    if (!ids.length) return [];
    const comms = await this.communityModel.find({ _id: { $in: ids } }).lean();
    return comms;
  }

  async getMembers(cId: string, page = 1, limit = 30, search?: string) {
    let q: any = { cId };
    if (search) {
      q = { cId, 'userData.fullNameEn': { $regex: search, $options: 'i' } };
    }
    const paginationParameters: any[] = [q, { limit: Math.min(Math.max(limit, 1), 50), page: Math.max(page, 1), sort: '-_id' }];
    return this.memberModel.paginate(...paginationParameters);
  }

  async getPendingRequests(cId: string, page = 1, limit = 30, search?: string) {
    let q: any = { cId, status: CommunityMemberStatus.Pending };
    if (search) {
      q = { cId, status: CommunityMemberStatus.Pending, 'userData.fullNameEn': { $regex: search, $options: 'i' } };
    }
    const paginationParameters: any[] = [q, { limit: Math.min(Math.max(limit, 1), 50), page: Math.max(page, 1), sort: '-_id' }];
    return this.memberModel.paginate(...paginationParameters);
  }

  async addMembers(cId: string, myId: string, ids: string[]) {
    await this.assertAdmin(cId, myId);
    let added = 0;
    for (const id of ids) {
      const exist = await this.memberModel.findOne({ cId, uId: id });
      if (exist) continue;
      const u = await this.userService.findByIdOrThrow(id, 'fullName fullNameEn userImage');
      await this.memberModel.create({
        uId: u._id,
        cId,
        role: CommunityRoleType.Member,
        status: CommunityMemberStatus.Active,
        userData: {
          _id: u._id,
          fullName: u.fullName,
          fullNameEn: u.fullNameEn,
          userImage: u.userImage,
        },
      } as any);
      added++;
    }
    return { added };
  }

  async removeMember(cId: string, myId: string, targetId: string) {
    const my = await this.assertAdmin(cId, myId);
    const target = await this.memberModel.findOne({ cId, uId: targetId });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === CommunityRoleType.Owner) throw new BadRequestException('Cannot remove owner');
    await this.memberModel.deleteOne({ _id: target._id });
    return 'removed';
  }

  async joinCommunity(cId: string, uId: string) {
    const c = await this.communityModel.findById(cId);
    if (!c) throw new NotFoundException('Community not found');
    const exist = await this.memberModel.findOne({ cId, uId });
    if (exist && exist.status === CommunityMemberStatus.Active) return 'already a member';

    const joinMode = (c as any).extraData?.joinMode || 'approval';
    const u = await this.userService.findByIdOrThrow(uId, 'fullName fullNameEn userImage');

    if (joinMode === 'open') {
      await this.memberModel.findOneAndUpdate(
        { cId, uId },
        {
          role: CommunityRoleType.Member,
          status: CommunityMemberStatus.Active,
          userData: {
            _id: u._id,
            fullName: u.fullName,
            fullNameEn: u.fullNameEn,
            userImage: u.userImage,
          },
        },
        { upsert: true }
      );
      return 'joined';
    }
    if (joinMode === 'inviteOnly') {
      throw new BadRequestException('Invite only');
    }
    // approval mode -> create or set pending
    await this.memberModel.findOneAndUpdate(
      { cId, uId },
      {
        role: CommunityRoleType.Member,
        status: CommunityMemberStatus.Pending,
        userData: {
          _id: u._id,
          fullName: u.fullName,
          fullNameEn: u.fullNameEn,
          userImage: u.userImage,
        },
      },
      { upsert: true }
    );
    return 'pending';
  }

  async respondJoinRequest(cId: string, myId: string, targetId: string, approve: boolean) {
    await this.assertAdmin(cId, myId);
    const req = await this.memberModel.findOne({ cId, uId: targetId });
    if (!req || req.status !== CommunityMemberStatus.Pending) throw new NotFoundException('No pending request');
    if (approve) {
      await this.memberModel.updateOne({ _id: req._id }, { status: CommunityMemberStatus.Active });
      return 'approved';
    } else {
      await this.memberModel.deleteOne({ _id: req._id });
      return 'declined';
    }
  }

  async getCommunity(cId: string) {
    const c = await this.communityModel.findById(cId);
    if (!c) throw new NotFoundException('Community not found');
    return c;
  }

  async getCommunityGroups(cId: string) {
    const docs = await this.groupSettings.findAll(
      { communityId: cId } as any,
      'gName gImg cId createdAt',
      { sort: '-_id' },
    );
    // Normalize to plain objects and add roomId/rId alias for clients
    return (docs as any[]).map((d: any) => {
      const o = typeof d.toObject === 'function' ? d.toObject() : d;
      return { ...o, roomId: o._id, rId: o._id };
    });
  }

  async createGroupInCommunity(cId: string, dto: { groupName: string; peerIds: string[]; groupDescription?: string; extraData?: any; myUser: any; imageBuffer?: Buffer; }) {
    // Ensure myUser is admin of community
    await this.assertAdmin(cId, dto.myUser._id);
    // Use existing group creation
    const res = await this.groupChannel.createGroupChat({
      groupName: dto.groupName,
      peerIds: dto.peerIds,
      groupDescription: dto.groupDescription,
      extraData: dto.extraData,
      myUser: dto.myUser,
      imageBuffer: dto.imageBuffer,
      imgUrl: undefined,
    } as any);
    // Attach communityId
    await this.groupSettings.findByIdAndUpdate((res as any)._id || (res as any).roomId, { communityId: cId } as any);
    return res;
  }

  async attachExistingGroup(cId: string, groupOrRoomId: string) {
    // Ensure group settings record exists; accept either group_settings _id or roomId (rId)
    const gs = await this.groupSettings.findOne({ $or: [{ _id: groupOrRoomId }, { rId: groupOrRoomId }] } as any, null);
    if (!gs) throw new NotFoundException('Group not found');
    await this.groupSettings.findByIdAndUpdate((gs as any)._id, { communityId: cId } as any);
    return 'attached';
  }

  async updateExtraData(cId: string, myId: string, data: any) {
    await this.assertAdmin(cId, myId);
    await this.communityModel.findByIdAndUpdate(cId, { extraData: data });
    return 'success';
  }

  async listCommunities(page = 1, limit = 30, search?: string) {
    const q: any = search ? { name: { $regex: search, $options: 'i' } } : {};
    return this.communityModel.find(q).limit(Math.min(Math.max(limit, 1), 50)).skip((Math.max(page, 1) - 1) * limit).sort('-_id');
  }

  async updateImage(cId: string, myId: string, file: any) {
    await this.assertAdmin(cId, myId);
    const url = await this.s3.putImageCropped(file.buffer, myId);
    await this.communityModel.findByIdAndUpdate(cId, { img: url });
    return url;
  }

  async getMyRole(cId: string, uId: string) {
    const m = await this.memberModel.findOne({ cId, uId }, 'role status').lean();
    const isAdmin = !!m && m.status === CommunityMemberStatus.Active && (m.role === CommunityRoleType.Owner || m.role === CommunityRoleType.Admin);
    return { role: m ? (m as any).role : null, isAdmin } as any;
  }

  async createAnnouncement(
    cId: string,
    myUser: any,
    data: { title?: string; content: string; pinned?: boolean },
  ) {
    await this.assertAdmin(cId, myUser._id);
    if (!data || !data.content || !data.content.toString().trim()) {
      throw new BadRequestException('content is required');
    }
    const u = await this.userService.findByIdOrThrow(myUser._id, 'fullName fullNameEn userImage');
    const doc = await this.announcementModel.create({
      cId,
      uId: myUser._id,
      title: data.title || null,
      content: data.content.toString(),
      pinned: !!data.pinned,
      userData: {
        _id: u._id,
        fullName: u.fullName,
        fullNameEn: u.fullNameEn,
        userImage: u.userImage,
      },
    } as any);
    return doc;
  }

  async getAnnouncements(cId: string, page = 1, limit = 20) {
    const p = Math.max(1, page);
    const l = Math.min(50, Math.max(1, limit));
    // pinned first then newest first
    const docs = await this.announcementModel
      .find({ cId })
      .sort({ pinned: -1, _id: -1 })
      .limit(l)
      .skip((p - 1) * l)
      .lean();
    return docs;
  }

  async listMyAnnouncements(uId: string, page = 1, limit = 20) {
    const p = Math.max(1, page);
    const l = Math.min(50, Math.max(1, limit));
    // get all community ids for this user: direct membership OR via groups
    const cIds = await this.getUserCommunityIds(uId);
    if (cIds.length === 0) return [];
    const [announcements, communities] = await Promise.all([
      this.announcementModel
        .find({ cId: { $in: cIds } as any })
        .sort({ pinned: -1, _id: -1 })
        .limit(l)
        .skip((p - 1) * l)
        .lean(),
      this.communityModel.find({ _id: { $in: cIds } } as any, 'name img').lean(),
    ]);
    const cmMap = new Map<string, any>();
    for (const cm of communities as any[]) cmMap.set(cm._id.toString(), cm);
    // role map based on direct memberships only (if not in member list, default to Member)
    const memberships = await this.memberModel.find({ uId, status: CommunityMemberStatus.Active }, 'cId role').lean();
    const roleMap = new Map<string, CommunityRoleType>();
    for (const m of memberships as any[]) roleMap.set(m.cId.toString(), m.role);
    return (announcements as any[]).map((a: any) => {
      const c = cmMap.get(a.cId.toString());
      const role = roleMap.get(a.cId.toString());
      const isAdmin = role === CommunityRoleType.Owner || role === CommunityRoleType.Admin;
      return {
        ...a,
        community: c ? { _id: c._id, name: c.name, img: c.img } : null,
        isAdmin,
      };
    });
  }

  async deleteAnnouncement(cId: string, myId: string, announcementId: string) {
    await this.assertAdmin(cId, myId);
    const res = await this.announcementModel.deleteOne({ _id: announcementId, cId } as any);
    if (!res || (res as any).deletedCount === 0) throw new NotFoundException('Announcement not found');
    return 'deleted';
  }
}
