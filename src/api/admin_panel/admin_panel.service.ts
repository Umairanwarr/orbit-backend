/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UpdateConfigDto } from "./dto/update_config_dto";
import { AppConfigService } from "../app_config/app_config.service";
import { UserService } from "../user_modules/user/user.service";
import { FileUploaderService } from "../../common/file_uploader/file_uploader.service";
import { ConfigService } from "@nestjs/config";
import { UserDeviceService } from "../user_modules/user_device/user_device.service";
import { newMongoObjId } from "../../core/utils/utils";
import { MongoIdDto } from "../../core/common/dto/mongo.id.dto";
import { CreateNewVersionDto, GetVersionDto } from "./dto/admin_dto";
import { CreateAdminNotificationDto } from "../admin_notification/dto/create-admin_notification.dto";
import { UserAdminService } from "./other/user_admin.service";
import { UserCountryAdminService } from "./other/user_country_admin.service";
import { VersionsAdminService } from "./other/versions_admin.service";
import { UserDeviceAdminService } from "./other/user_device_admin.service";
import { SocketIoService } from "../../chat/socket_io/socket_io.service";
import { ChannelAdminService } from "./other/channel_admin_service";
import { ChannelService } from "../../chat/channel/services/channel.service";
import { MessageService } from "../../chat/message/message.service";
import { MessagesSearchDto } from "../../chat/message/dto/messages_search_dto";
import { ReportSystemService } from "../report_system/report_system.service";
import { PaginationParameters } from "mongoose-paginate-v2";
import { Platform, UserRole, SocketEventsType } from "../../core/utils/enums";
import { AdminNotificationService } from "../admin_notification/admin_notification.service";
import { NotificationEmitterAdminService } from "./other/notification_emitter_admin.service";
import { AdsService } from "../ads/ads.service";
import { DriverApplicationsService } from "../drivers/driver_applications.service";
import { SellerApplicationsService } from "../sellers/seller_applications.service";
import { GroupMemberService } from "../../chat/group_member/group_member.service";
import { GroupSettingsService } from "../../chat/group_settings/group_settings.service";
import { RoomMemberService } from "../../chat/room_member/room_member.service";
import { GroupMessageStatusService } from "../../chat/group_message_status/group_message_status.service";
import { StoryService } from "../stories/story/story.service";
import { GiftService } from "../gifts/gift.service";
import { VerificationService } from "../verification/verification.service";
import { CreateS3UploaderDto } from "../../common/file_uploader/create-s3_uploader.dto";
import { ILiveCategory } from "../live_stream/interfaces/live_category.interface";
import { NotificationEmitterService } from "../../common/notification_emitter/notification_emitter.service";
import { NotificationData } from "../../common/notification_emitter/notification.event";
import { EmergencyContactService } from "../user_modules/emergency_contact/emergency_contact.service";
import { WithdrawRequestsService } from "../wallet/withdraw_requests.service";
import bcrypt from "bcrypt";
import { MarketplaceListingReportService } from "../marketplace/marketplace_listing_report.service";
import { MarketplaceListingsService } from "../marketplace/marketplace_listings.service";
import { MusicService } from "../music/music.service";
import { MusicReportService } from "../music/music_report.service";
import { ArticlesService } from "../articles/articles.service";
import { ArticleReportService } from "../articles/article_report.service";

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
    private readonly roomMemberService: RoomMemberService,
    private readonly groupMessageStatusService: GroupMessageStatusService,
    private readonly storyService: StoryService,
    private readonly socketIoService: SocketIoService,
    private readonly giftService: GiftService,
    private readonly verificationService: VerificationService,
    private readonly adsService: AdsService,
    private readonly musicService: MusicService,
    private readonly musicReportService: MusicReportService,
    private readonly articlesService: ArticlesService,
    private readonly articleReportService: ArticleReportService,
    private readonly driverApplicationsService: DriverApplicationsService,
    private readonly sellerApplicationsService: SellerApplicationsService,
    private readonly notificationEmitterService: NotificationEmitterService,
    private readonly emergencyContactService: EmergencyContactService,
    private readonly withdrawRequestsService: WithdrawRequestsService,
    private readonly marketplaceListingsService: MarketplaceListingsService,
    private readonly marketplaceListingReportService: MarketplaceListingReportService,
    @InjectModel('LiveCategory') private readonly liveCategoryModel: Model<ILiveCategory>
  ) {}

  async updateConfig(dto: UpdateConfigDto) {
    let config = await this.appConfigService.getConfig();
    if (!config) throw new Error("Config not found");
    
    // Convert Mongoose document to plain object to ensure proper spreading
    const configObj = (config as any).toObject ? (config as any).toObject() : { ...config };
    
    // Remove undefined values from dto to prevent overwriting existing values
    const cleanDto: any = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        cleanDto[key] = value;
      }
    }
    
    return await this.appConfigService.insert({
      ...configObj,
      ...cleanDto,
      _id: newMongoObjId().toString(),
    });
  }

  // Live Categories Management
  async getLiveCategories() {
    const list = await this.liveCategoryModel.find({}).sort({ name: 1 }).exec();
    return list.map((c) => ({
      _id: c._id.toString(),
      name: c.name,
      description: c.description ?? '',
      isActive: c.isActive,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async createLiveCategory(data: { name: string; description?: string; isActive?: boolean }) {
    const exists = await this.liveCategoryModel.findOne({ name: data.name.trim() });
    if (exists) {
      throw new Error('Category already exists');
    }
    const created = await this.liveCategoryModel.create({
      name: data.name.trim(),
      description: data.description?.trim() || '',
      isActive: data.isActive ?? true,
    });
    return {
      _id: created._id.toString(),
      name: created.name,
      description: created.description ?? '',
      isActive: created.isActive,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async updateLiveCategory(
    id: string,
    data: { name?: string; description?: string; isActive?: boolean }
  ) {
    const updated = await this.liveCategoryModel.findByIdAndUpdate(
      id,
      {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description.trim() } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      { new: true }
    );
    if (!updated) throw new NotFoundException('Category not found');
    return {
      _id: updated._id.toString(),
      name: updated.name,
      description: updated.description ?? '',
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteLiveCategory(id: string) {
    const res = await this.liveCategoryModel.findByIdAndDelete(id);
    if (!res) throw new NotFoundException('Category not found');
    return 'Category deleted successfully';
  }

  async getAppConfig() {
    return this.appConfigService.getConfig();
  }

  async updatePrivacyPolicy(privacyPolicyText: string) {
    const config = await this.appConfigService.getConfig();
    if (!config) throw new Error("Config not found");
    await this.appConfigService.insert({
      ...config,
      privacyPolicyText: privacyPolicyText,
      _id: newMongoObjId().toString(),
    });
    return { message: "Privacy policy updated successfully", privacyPolicyText };
  }

  async getPrivacyPolicy() {
    const config = await this.appConfigService.getConfig();
    return { privacyPolicyText: config?.privacyPolicyText || null };
  }

  async updateAdminPassword(newPassword: string) {
    if (!newPassword || newPassword.toString().trim().length < 6) {
      throw new BadRequestException("Admin password must be at least 6 characters");
    }

    const config = await this.appConfigService.getConfig();
    if (!config) throw new Error("Config not found");

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword.toString(), salt);

    await this.appConfigService.insert({
      ...config,
      adminPanelPasswordHash: hash,
      _id: newMongoObjId().toString(),
    } as any);

    return { message: "Admin password updated successfully" };
  }

  async setNewVersion(dto: CreateNewVersionDto) {
    return this.versionsAdminService.setNewVersion(dto);
  }

  async getVersions(platform: GetVersionDto) {
    return this.versionsAdminService.getVersions(platform);
  }

  async deleteVersion(id: MongoIdDto) {
    return this.versionsAdminService.deleteVersion(id);
  }

  async createNotification(dto: CreateAdminNotificationDto) {
    if (dto.imageBuffer) {
      dto.imageUrl = await this.uploaderService.putImageCropped(
        dto.imageBuffer,
        "admin"
      );
    }
    await this.adminNotificationService.create(dto);
    await this.emitterAdminService.emitNotification(dto);
    return "Done";
  }

  async getUserInfo(dto: MongoIdDto) {
    let isOnline = await this.socket.getOnlineFromList([dto.id]);
    let data = await this.countryAdminService.getUserCountries(dto.id);
    let userCountries = [];
    for (let i of data) {
      try {
        userCountries.push(i["data"][0]);
      } catch (err) {
        console.log(
          "Error while get userCountryService getCountriesInfo for loop!"
        );
      }
    }

    return {
      userInfo: {
        ...(await this.userService.findById(dto.id, null, {
          populate: "countryId",
        })),
        isOnline: isOnline.length > 0,
      },
      visits: await this.userDeviceAdminService.getUserVisits(dto.id),
      userDevices: await this.userDeviceService.findAll({
        uId: dto.id,
      }),
      userCountries: userCountries,
      userReports: await this.reportSystemService.findAll(
        {
          targetId: dto.id,
          isDeleted: false,
        },
        null,
        {
          populate: {
            path: "uId",
            select:
              "fullName verifiedAt userImage registerStatus banTo lastSeenAt bio",
          },
          limit: 30,
        }
      ),
      chats: {
        messagesCounter:
          await this.channelAdminService.getMessagesCounterForPeer(dto.id),
        roomCounter: await this.channelAdminService.getRoomCounterForPeer(
          dto.id
        ),
      },
    };
  }

  async getUsers(dto: Object) {
    return this.userAdminService.getUsers(dto);
  }

  async getUsersDashboardInfo() {
    return {
      usersData: await this.userAdminService.getUsersData(),
      usersDevices: await this.userDeviceAdminService.getUsersDevicesInfo(),
      statistics: {
        visits: await this.userDeviceAdminService.getTotalVisits(),
        iosVisits: await this.userDeviceAdminService.getPlatformVisits(
          Platform.Ios
        ),
        androidVisits: await this.userDeviceAdminService.getPlatformVisits(
          Platform.Android
        ),
        webVisits: await this.userDeviceAdminService.getPlatformVisits(
          Platform.Web
        ),
        otherVisits: await this.userDeviceAdminService.getPlatformVisits(
          Platform.Other
        ),
      },
      usersCountries: await this.countryAdminService.getCountriesInfo(),
    };
  }

  async getNotification() {
    return this.adminNotificationService.findAll({}, null, { sort: "-_id" });
  }

  async setLiveWatermark(imageFile: Express.Multer.File): Promise<string> {
    // Upload watermark to storage
    const uploaderDto = new CreateS3UploaderDto();
    uploaderDto.mediaBuffer = imageFile.buffer;
    uploaderDto.fileName = imageFile.originalname || 'watermark.png';
    uploaderDto.myUser = { _id: 'admin' } as any;
    const imageUrl = await this.fileUploaderService.uploadChatMedia(uploaderDto);

    // Update app config with new watermark URL by inserting new config doc
    const current = await this.appConfigService.getConfig();
    await this.appConfigService.insert({
      ...current,
      _id: newMongoObjId().toString(),
      liveWatermarkUrl: imageUrl,
    } as any);

    return imageUrl;
  }

  async deleteLiveWatermark(): Promise<string | null> {
    // Remove watermark from app config (do not delete blob)
    const current = await this.appConfigService.getConfig();
    await this.appConfigService.insert({
      ...current,
      _id: newMongoObjId().toString(),
      liveWatermarkUrl: null,
    } as any);
    return null;
  }

  async getUserChats(peerId: string, filter: object) {
    return this.channelService.getRoomsLimited(filter, peerId);
    ///there are two type of notification users join admin push
  }

  async getCountriesInfo() {
    return this.countryAdminService.getCountriesInfo();
  }

  async getChatDashboardInfo() {
    return {
      messagesCounter: await this.channelAdminService.getMessagesCounter(),
      roomCounter: await this.channelAdminService.getRoomCounter(),
    };
  }

  async updateUserInfo(id: string, body: object) {
    let user = await this.userService.findByIdOrThrow(id);
    if (body["hasBadge"] == true) {
      body["roles"] = [...user.roles, UserRole.HasBadge];
    }
    if (body["hasBadge"] == false) {
      body["roles"] = [...user.roles];
      body["roles"] = body["roles"].filter(
        (item: UserRole) => item !== UserRole.HasBadge
      );
    }
    await this.userAdminService.updateUserData(id, body);
    return `Done ${body}`;
  }

  async updateUserRole(id: string, body: { roles: UserRole[] }) {
    let user = await this.userService.findByIdOrThrow(id);

    // Convert both old and new roles to a Set to ensure uniqueness
    const roles = new Set<UserRole>(user.roles || []);

    // Add new roles from body
    for (const role of body.roles) {
      roles.add(role);
    }

    // Prepare update payload
    const updatePayload = {
      roles: Array.from(roles),
    };

    await this.userAdminService.updateUserData(id, updatePayload);
    return { message: "Roles updated", updatedRoles: updatePayload.roles };
  }

  async grantAdminRole(id: string) {
    const user = await this.userService.findByIdOrThrow(id);
    const roles = new Set<UserRole>(user.roles || []);
    roles.add(UserRole.Admin);
    await this.userAdminService.updateUserData(id, { roles: Array.from(roles) });
    return { message: "Admin role granted", updatedRoles: Array.from(roles) };
  }

  async revokeAdminRole(id: string) {
    const user = await this.userService.findByIdOrThrow(id);
    const roles = new Set<UserRole>(user.roles || []);
    roles.delete(UserRole.Admin);
    await this.userAdminService.updateUserData(id, { roles: Array.from(roles) });
    return { message: "Admin role revoked", updatedRoles: Array.from(roles) };
  }

  async banUser(
    id: string,
    body: { type: "general" | "message" | "live"; until: Date }
  ) {
    const update: any = {};

    if (body.type === "general") {
      update.banTo = body.until;
    } else if (body.type === "message") {
      update.banMessageTo = body.until;
    } else if (body.type === "live") {
      update.banLiveTo = body.until;
    }

    await this.userAdminService.updateUserData(id, update);
    return { message: `User banned from ${body.type} until ${body.until}` };
  }

  async unbanUser(id: string, body: { type: "general" | "message" | "live" }) {
    const update: any = {};

    if (body.type === "general") {
      update.banTo = null;
    } else if (body.type === "message") {
      update.banMessageTo = null;
    } else if (body.type === "live") {
      update.banLiveTo = null;
    }

    await this.userAdminService.updateUserData(id, update);
    return { message: `User unbanned from ${body.type}` };
  }

  async banDriverFromRide(id: string, body: { reason: string }) {
    const reason = (body?.reason ?? '').toString().trim();
    if (!reason) {
      throw new BadRequestException('reason is required');
    }

    const user = await this.userService.findByIdOrThrow(id, 'roles');
    const roles = new Set<UserRole>(user.roles || []);
    if (!roles.has(UserRole.Driver)) {
      throw new BadRequestException('User is not a driver');
    }

    await this.userAdminService.updateUserData(id, {
      rideBannedAt: new Date(),
      rideBanReason: reason,
      rideUnbannedAt: null,
    });

    return { message: 'Driver banned from Ride', rideBanReason: reason };
  }

  async unbanDriverFromRide(id: string) {
    const user = await this.userService.findByIdOrThrow(id, 'roles');
    const roles = new Set<UserRole>(user.roles || []);
    if (!roles.has(UserRole.Driver)) {
      throw new BadRequestException('User is not a driver');
    }

    await this.userAdminService.updateUserData(id, {
      rideUnbannedAt: new Date(),
    });

    return { message: 'Driver unbanned from Ride' };
  }

  async verifyUser(id: string, durationMonths?: number) {
    let user = await this.userService.findByIdOrThrow(id);
    const roles = new Set<UserRole>(user.roles || []);
    roles.add(UserRole.HasBadge);
    const months = Number(durationMonths ?? 0);
    const until = months > 0
      ? new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000)
      : null;
    
    await this.userAdminService.updateUserData(id, { 
      verifiedAt: new Date(),
      verifiedUntil: until,
      roles: Array.from(roles)
    });
    return { message: "User verified successfully" };
  }

  async unverifyUser(id: string) {
    let user = await this.userService.findByIdOrThrow(id);
    const roles = new Set<UserRole>(user.roles || []);
    roles.delete(UserRole.HasBadge);
    
    await this.userAdminService.updateUserData(id, { 
      verifiedAt: null,
      verifiedUntil: null,
      roles: Array.from(roles)
    });
    return { message: "User unverified successfully" };
  }

  async getUserChatsMessages(userId: string, roomId: string, filter: object) {
    let dto = new MessagesSearchDto();
    dto.lastId = filter["lastId"];
    dto.limit = filter["limit"];
    return this.messageService.findAllMessagesAggregation(
      newMongoObjId(userId),
      newMongoObjId(roomId),
      dto
    );
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
            path: "uId",
            select:
              "fullName verifiedAt userImage registerStatus banTo lastSeenAt bio",
          },
          {
            path: "targetId",
            select:
              "fullName verifiedAt userImage registerStatus banTo lastSeenAt bio",
          },
        ],
      },
    }).get();
    delete dto["limit"];
    delete dto["page"];
    paginationParameters[0] = dto;

    return this.reportSystemService.paginate(paginationParameters);
  }

  async getMarketplaceListingReports(dto: any) {
    dto = dto ?? {};
    const q = (dto?.search ?? dto?.q ?? '').toString().trim();
    const status = (dto?.status ?? '').toString().trim();
    const listingId = (dto?.listingId ?? '').toString().trim();
    const uId = (dto?.uId ?? '').toString().trim();

    const filter: any = {
      ...(status ? { status } : {}),
      ...(listingId ? { listingId } : {}),
      ...(uId ? { uId } : {}),
      ...(q
        ? {
            content: {
              $regex: q,
              $options: 'i',
            },
          }
        : {}),
    };

    const paginationParameters = new PaginationParameters({
      query: {
        limit: 50,
        page: 1,
        sort: '-_id',
        ...dto,
        populate: [
          {
            path: 'uId',
            select:
              'fullName verifiedAt userImage registerStatus banTo lastSeenAt bio',
          },
          {
            path: 'listingId',
          },
        ],
      },
    }).get();

    delete dto['limit'];
    delete dto['page'];
    delete dto['search'];
    delete dto['q'];
    paginationParameters[0] = filter;

    const page: any = await this.marketplaceListingReportService.paginate(paginationParameters);
    const docs: any[] = Array.isArray(page?.docs) ? page.docs : [];
    const ownerIds = Array.from(
      new Set(
        docs
          .map((d) => {
            const listing = d?.listingId;
            const ownerId = listing && typeof listing === 'object' ? listing.userId : null;
            return ownerId?.toString?.() ?? '';
          })
          .filter((x) => x && x.length > 0),
      ),
    );

    let ownersById: Record<string, any> = {};
    if (ownerIds.length > 0) {
      const owners = await this.userService.findAll(
        {
          _id: { $in: ownerIds },
        } as any,
        'fullName userImage',
        null,
      );
      ownersById = (owners || []).reduce((acc, u) => {
        const id = (u?._id ?? '').toString();
        if (id) acc[id] = u;
        return acc;
      }, {} as Record<string, any>);
    }

    page.docs = docs.map((d) => {
      const base = typeof d?.toObject === 'function' ? d.toObject() : d;
      const listing = d?.listingId;
      const ownerId = listing && typeof listing === 'object' ? listing.userId : null;
      const ownerKey = ownerId?.toString?.() ?? '';
      return {
        ...base,
        listingOwner: ownerKey ? ownersById[ownerKey] ?? null : null,
      };
    });

    return page;
  }

  async ignoreMarketplaceListingReport(id: string, adminId?: string) {
    await this.marketplaceListingReportService.markIgnored(id, adminId);
    return 'Done';
  }

  async removeMarketplaceListingByReport(id: string, adminId?: string) {
    const rep = await this.marketplaceListingReportService.findByIdOrThrow(id);
    const listingId = (rep as any).listingId?.toString() ?? '';
    if (!listingId) {
      throw new NotFoundException('Listing not found');
    }
    await this.marketplaceListingsService.adminRemoveListing(listingId);
    await this.marketplaceListingReportService.markRemoved(id, adminId);
    return 'Done';
  }

  async getMarketplaceSoldOutListings(dto: any) {
    dto = dto ?? {};
    const page = Number(dto?.page ?? 1);
    const limit = Number(dto?.limit ?? 20);
    const paymentReleasedRaw = (dto?.paymentReleased ?? '').toString().trim().toLowerCase();

    let paymentReleased: boolean | undefined;
    if (paymentReleasedRaw === 'true') paymentReleased = true;
    if (paymentReleasedRaw === 'false') paymentReleased = false;

    const result: any = await this.marketplaceListingsService.getSoldOutListingsForAdmin(
      page,
      limit,
      paymentReleased,
    );

    const docs: any[] = Array.isArray(result?.docs) ? result.docs : [];
    const userIds = Array.from(
      new Set(
        docs
          .map((d) => (d?.userId ?? '').toString())
          .filter((x) => x.length > 0),
      ),
    );

    let usersById: Record<string, any> = {};
    if (userIds.length > 0) {
      const users = await this.userService.findAll(
        {
          _id: { $in: userIds },
        } as any,
        'fullName userImage email',
        null,
      );
      usersById = (users || []).reduce((acc, u) => {
        const id = (u?._id ?? '').toString();
        if (id) acc[id] = u;
        return acc;
      }, {} as Record<string, any>);
    }

    result.docs = docs.map((d) => {
      const userId = (d?.userId ?? '').toString();
      return {
        ...d,
        seller: userId ? usersById[userId] ?? null : null,
      };
    });

    return result;
  }

  async releaseMarketplaceSoldPayment(listingId: string, adminId?: string) {
    return this.marketplaceListingsService.releaseSoldPaymentByAdmin(listingId, adminId);
  }

  async deleteReport(id: string) {
    await this.reportSystemService.findByIdAndDelete(id);
    return "Done";
  }

  async getUsersLog() {
    return this.userAdminService.getUsersLog();
  }

  async login(x) {
    return {
      isViewer: x,
    };
  }

  async getDashboard() {
    return {
      ...(await this.getUsersDashboardInfo()),
      ...(await this.getChatDashboardInfo()),
    };
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
    const groupMembers = await this.groupMemberService.findAll(
      {
        uId: userId,
      },
      null,
      {
        populate: {
          path: "rId",
          select: "gName gImg cId createdAt",
        },
        ...paginationParameters[1],
      }
    );

    // Get group settings for each group
    const groupsWithDetails = await Promise.all(
      groupMembers.map(async (member) => {
        const groupSettings = await this.groupSettingsService.findById(
          member.rId
        );
        const memberCount = await this.groupMemberService.findCount({
          rId: member.rId,
        });

        return {
          groupId: member.rId,
          groupName: groupSettings?.gName || "Unknown Group",
          groupImage: groupSettings?.gImg || "",
          creatorId: groupSettings?.cId || "",
          memberRole: member.gR,
          memberCount: memberCount,
          createdAt: groupSettings?.createdAt || member.createdAt,
          joinedAt: member.createdAt,
        };
      })
    );

    return {
      groups: groupsWithDetails,
      totalCount: groupsWithDetails.length,
    };
  }

  async deleteGroup(groupId: string) {
    // Delete group settings
    await this.groupSettingsService.findByIdAndDelete(groupId);

    // Delete all group members
    await this.groupMemberService.deleteMany({ rId: groupId });

    // Delete room members
    await this.roomMemberService.deleteMany({ rId: groupId });

    // Delete group message status
    await this.groupMessageStatusService.deleteMany({ rId: groupId } as any);

    // Delete all messages in the group
    await this.messageService.deleteWhere({ rId: groupId });

    return "Group deleted successfully";
  }

  async getGroupsChannels(filter: any) {
    let paginationParameters = new PaginationParameters({
      query: {
        limit: 50,
        page: 1,
        sort: "-_id",
        ...filter,
      },
    }).get();

    const q: any = {};
    const type = (filter?.type ?? '').toString();
    if (type === 'group') {
      q['extraData.isChannel'] = { $ne: true };
    } else if (type === 'channel') {
      q['extraData.isChannel'] = true;
    }

    const search = (filter?.search ?? '').toString().trim();
    if (search) {
      q['gName'] = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }

    const opts = paginationParameters[1] || {};
    const limit = Number(opts.limit || filter?.limit || 50);
    const page = Number(opts.page || filter?.page || 1);
    const skip = (page - 1) * limit;

    const docs = await this.groupSettingsService.findAll(q, null, {
      sort: { _id: -1 },
      limit,
      skip,
    } as any);

    const totalCount = await this.groupSettingsService.findCount(q);

    const items = await Promise.all(
      (docs || []).map(async (g: any) => {
        const id = (g?._id?.toString?.() ?? g?._id ?? '').toString();
        const isChannel = Boolean(g?.extraData && (g.extraData as any)['isChannel'] === true);
        const membersCount = await this.groupMemberService.findCount({ rId: id } as any);
        return {
          id,
          name: g?.gName ?? '',
          image: g?.gImg ?? '',
          creatorId: g?.cId ?? null,
          isChannel,
          membersCount,
          createdAt: g?.createdAt ?? null,
        };
      }),
    );

    return {
      items,
      totalCount,
      page,
      limit,
    };
  }

  async deleteGroupsChannels(roomId: string) {
    const settings = await this.groupSettingsService.findById(roomId);
    if (!settings) throw new NotFoundException('Group/Channel not found');

    const members = await this.groupMemberService.findAll({ rId: roomId } as any);
    for (const m of members || []) {
      try {
        await this.socketIoService.kickGroupMember(roomId.toString(), (m as any).uId.toString());
        await this.socketIoService.leaveRoom(roomId, (m as any).uId);
      } catch (_) {}
    }

    await this.groupSettingsService.findByIdAndDelete(roomId);
    await this.groupMemberService.deleteMany({ rId: roomId } as any);
    await this.roomMemberService.updateMany({ rId: roomId } as any, { isD: true, isA: false } as any);

    await this.groupMessageStatusService.deleteMany({ rId: roomId } as any);
    await this.messageService.deleteWhere({ rId: roomId } as any);

    return 'Deleted successfully';
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

    const members = await this.groupMemberService.findAll(
      {
        rId: groupId,
      },
      null,
      {
        populate: {
          path: "uId",
          select:
            "fullName userImage verifiedAt registerStatus banTo lastSeenAt",
        },
        ...paginationParameters[1],
      }
    );

    return {
      members: members.map((member) => ({
        userId: member.uId.toString(),
        userData: member.userData,
        role: member.gR,
        joinedAt: member.createdAt,
      })),
      totalCount: members.length,
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

    const stories = await this.storyService.findAll(
      {
        userId: userId,
      },
      null,
      {
        ...paginationParameters[1],
      }
    );

    return {
      stories: stories.map((story) => ({
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
        expireAt: story.expireAt,
      })),
      totalCount: stories.length,
    };
  }

  async deleteStory(storyId: string) {
    // Get the story before deleting to get the userId
    const story = await this.storyService.findByIdOrThrow(storyId);
    const userId = story.userId;

    // Delete the story
    await this.storyService.findByIdAndDelete(storyId);

    // Emit socket event to notify all connected clients about story deletion
    this.socketIoService.io.emit(
      SocketEventsType.v1OnStoryDeleted,
      JSON.stringify({
        storyId: storyId,
        userId: userId,
        deletedAt: new Date(),
        deletedBy: "admin",
      })
    );

    return "Story deleted successfully";
  }

  // Gift Management Methods
  async getGifts(filter: object = {}) {
    const gifts = await this.giftService.findAll(filter, null, {
      sort: { createdAt: -1 },
    });

    return {
      gifts: gifts.map((gift) => ({
        id: gift._id.toString(),
        name: gift.name,
        description: gift.description,
        imageUrl: gift.imageUrl,
        price: gift.price,
        isActive: gift.isActive,
        createdAt: gift.createdAt,
        updatedAt: gift.updatedAt,
      })),
      totalCount: gifts.length,
    };
  }

  async createGift(
    data: {
      name: string;
      description?: string;
      price: number;
      isActive?: boolean;
    },
    imageFile?: any
  ) {
    if (!imageFile) {
      throw new Error("Image file is required for creating a gift");
    }

    const uploaderDto = new CreateS3UploaderDto();
    uploaderDto.mediaBuffer = imageFile.buffer;
    uploaderDto.fileName = imageFile.originalname;
    uploaderDto.myUser = { _id: "admin" } as any;
    const imageUrl = await this.fileUploaderService.uploadChatMedia(
      uploaderDto
    );

    // Treat admin-entered price as USD; compute/stash KES for runtime use
    const rate = Number(process.env.USD_TO_KES_RATE || this.configService.get<string>('USD_TO_KES_RATE') || 160);
    const priceUsd = data.price;
    const priceKes = Math.round(priceUsd * rate);

    const gift = await this.giftService.create({
      name: data.name,
      description: data.description,
      imageUrl: imageUrl,
      price: data.price, // legacy field (USD)
      currency: 'USD',
      priceUsd: priceUsd,
      priceKes: priceKes,
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
      updatedAt: gift.updatedAt,
    };
  }

  // ================= Ads Management =================
  async getAds(dto: any) {
    let paginationParameters = new PaginationParameters({
      query: {
        limit: 50,
        page: 1,
        sort: "-_id",
        ...dto,
      },
    }).get();
    const filter: any = { ...dto };
    delete filter["limit"]; delete filter["page"]; delete filter["sort"]; 
    paginationParameters[0] = filter;
    return this.adsService.paginate(paginationParameters as any);
  }

  async getAdById(id: string) {
    const ad = await this.adsService.findById(id);
    if (!ad) throw new NotFoundException("Ad not found");
    return ad;
  }

  async reviewAd(id: string, body: { status: 'approved' | 'rejected'; note?: string }, reviewerId: string) {
    return this.adsService.review(id, body.status, body.note, reviewerId);
  }

  async deleteAd(id: string) {
    return this.adsService.delete(id);
  }

  async getMusic(dto: any) {
    const res = await this.musicService.list(dto);
    const limit = Number(res.limit) || 20;
    const page = Number(res.page) || 1;
    const totalDocs = Number(res.total) || 0;
    const totalPages = Math.max(1, Math.ceil(totalDocs / Math.max(1, limit)));
    return {
      docs: res.docs,
      totalDocs,
      limit,
      totalPages,
      page,
      pagingCounter: (page - 1) * limit + 1,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
    };
  }

  async deleteMusic(id: string) {
    return this.musicService.deleteMusicAsAdmin(id);
  }

  async getMusicReports(dto: any) {
    dto = dto ?? {};
    const q = (dto?.search ?? dto?.q ?? '').toString().trim();
    const status = (dto?.status ?? 'pending').toString().trim();
    const musicId = (dto?.musicId ?? '').toString().trim();
    const uId = (dto?.uId ?? '').toString().trim();

    const filter: any = {
      ...(status && status !== 'all' ? { status } : {}),
      ...(musicId ? { musicId } : {}),
      ...(uId ? { uId } : {}),
      ...(q
        ? {
            content: {
              $regex: q,
              $options: 'i',
            },
          }
        : {}),
    };

    const paginationParameters = new PaginationParameters({
      query: {
        limit: 50,
        page: 1,
        sort: '-_id',
        ...dto,
        populate: [
          {
            path: 'uId',
            select: 'fullName userImage verifiedAt registerStatus banTo lastSeenAt bio',
          },
          {
            path: 'musicId',
          },
        ],
      },
    }).get();

    delete dto['limit'];
    delete dto['page'];
    delete dto['search'];
    delete dto['q'];
    delete dto['status'];
    delete dto['musicId'];
    delete dto['uId'];
    paginationParameters[0] = filter;

    return this.musicReportService.paginate(paginationParameters);
  }

  async getArticles(dto: any) {
    const res = await this.articlesService.list(dto);
    const limit = Number(res.limit) || 20;
    const page = Number(res.page) || 1;
    const totalDocs = Number(res.total) || 0;
    const totalPages = Math.max(1, Math.ceil(totalDocs / Math.max(1, limit)));
    return {
      docs: res.docs,
      totalDocs,
      limit,
      totalPages,
      page,
      pagingCounter: (page - 1) * limit + 1,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
    };
  }

  async deleteArticle(id: string) {
    return this.articlesService.deleteArticleAsAdmin(id);
  }

  async getArticleReports(dto: any) {
    dto = dto ?? {};
    const q = (dto?.search ?? dto?.q ?? '').toString().trim();
    const status = (dto?.status ?? 'pending').toString().trim();
    const articleId = (dto?.articleId ?? '').toString().trim();
    const uId = (dto?.uId ?? '').toString().trim();

    const filter: any = {
      ...(status && status !== 'all' ? { status } : {}),
      ...(articleId ? { articleId } : {}),
      ...(uId ? { uId } : {}),
      ...(q
        ? {
            content: {
              $regex: q,
              $options: 'i',
            },
          }
        : {}),
    };

    const paginationParameters = new PaginationParameters({
      query: {
        limit: 50,
        page: 1,
        sort: '-_id',
        ...dto,
        populate: [
          {
            path: 'uId',
            select: 'fullName userImage verifiedAt registerStatus banTo lastSeenAt bio',
          },
          {
            path: 'articleId',
          },
        ],
      },
    }).get();

    delete dto['limit'];
    delete dto['page'];
    delete dto['search'];
    delete dto['q'];
    delete dto['status'];
    delete dto['articleId'];
    delete dto['uId'];
    paginationParameters[0] = filter;

    return this.articleReportService.paginate(paginationParameters);
  }

  // ================= Verification Applications =================
  async getVerificationApplications(dto: any) {
    let paginationParameters = new PaginationParameters({
      query: {
        limit: 50,
        page: 1,
        sort: "-_id",
        ...dto,
      },
    }).get();
    // Clean pagination-only fields from filter
    const filter: any = { ...dto };
    delete filter["limit"]; delete filter["page"]; delete filter["sort"]; 
    paginationParameters[0] = filter;

    const res = await this.verificationService.paginate(paginationParameters);

    // Enrich with basic user info
    const docs = await Promise.all(
      res.docs.map(async (r: any) => {
        let userBasic: any = null;
        try {
          const u = await this.userService.findById(r.userId, "fullName email userImage roles verifiedAt");
          userBasic = u ? {
            _id: u._id,
            fullName: u.fullName,
            email: u.email,
            userImage: u.userImage,
            hasBadge: Array.isArray(u.roles) && u.roles.includes(UserRole.HasBadge),
            verifiedAt: u.verifiedAt,
          } : null;
        } catch (e) {}
        return {
          ...r.toObject?.() ?? r,
          userBasic,
        };
      })
    );

    return {
      ...res,
      docs,
    };
  }

  async getVerificationApplicationById(id: string) {
    const doc = await this.verificationService.findById(id);
    if (!doc) throw new NotFoundException("Verification application not found");
    let userBasic: any = null;
    try {
      const u = await this.userService.findById(doc.userId, "fullName email userImage roles verifiedAt");
      userBasic = u ? {
        _id: u._id,
        fullName: u.fullName,
        email: u.email,
        userImage: u.userImage,
        hasBadge: Array.isArray(u.roles) && u.roles.includes(UserRole.HasBadge),
        verifiedAt: u.verifiedAt,
      } : null;
    } catch (e) {}

    return {
      ...(doc.toObject?.() ?? (doc as any)),
      userBasic,
    };
  }

  // ================= Withdraw Requests =================
  async getWithdrawRequests(dto: any) {
    let paginationParameters = new PaginationParameters({
      query: {
        limit: 50,
        page: 1,
        sort: "-_id",
        ...dto,
      },
    }).get();
    const filter: any = { ...dto };
    delete filter["limit"]; delete filter["page"]; delete filter["sort"];
    paginationParameters[0] = filter;

    const res = await this.withdrawRequestsService.paginate(
      paginationParameters as any,
    );

    const docs = await Promise.all(
      res.docs.map(async (r: any) => {
        let userBasic: any = null;
        try {
          const u = await this.userService.findById(
            r.userId,
            "fullName email userImage roles verifiedAt",
          );
          userBasic = u
            ? {
                _id: u._id,
                fullName: u.fullName,
                email: u.email,
                userImage: u.userImage,
                hasBadge:
                  Array.isArray(u.roles) &&
                  u.roles.includes(UserRole.HasBadge),
                verifiedAt: u.verifiedAt,
              }
            : null;
        } catch (e) {}
        return {
          ...(r.toObject?.() ?? r),
          userBasic,
        };
      }),
    );

    return {
      ...res,
      docs,
    };
  }

  async getWithdrawRequestById(id: string) {
    const doc = await this.withdrawRequestsService.findById(id);
    if (!doc) throw new NotFoundException("Withdraw request not found");
    let userBasic: any = null;
    try {
      const u = await this.userService.findById(
        doc.userId,
        "fullName email userImage roles verifiedAt",
      );
      userBasic = u
        ? {
            _id: u._id,
            fullName: u.fullName,
            email: u.email,
            userImage: u.userImage,
            hasBadge:
              Array.isArray(u.roles) &&
              u.roles.includes(UserRole.HasBadge),
            verifiedAt: u.verifiedAt,
          }
        : null;
    } catch (e) {}
    return {
      ...(doc.toObject?.() ?? (doc as any)),
      userBasic,
    };
  }

  async reviewWithdrawRequest(
    id: string,
    body: { status: "approved" | "rejected"; note?: string },
    reviewerId: string,
  ) {
    const doc = await this.withdrawRequestsService.findById(id);
    if (!doc) throw new NotFoundException("Withdraw request not found");

    if (body.status === "approved") {
      await this.userService.subtractFromBalance(
        doc.userId as any,
        doc.amount as any,
      );
    }

    const updated = await this.withdrawRequestsService.findByIdAndUpdate(id, {
      status: body.status,
      note: body.note ?? null,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
    });

    return {
      message: `Withdraw ${body.status}`,
      request: updated,
    };
  }

  async reviewVerificationApplication(
    id: string,
    body: { status: 'approved' | 'rejected'; note?: string },
    reviewerId: string,
  ) {
    const doc = await this.verificationService.findById(id);
    if (!doc) throw new NotFoundException("Verification application not found");

    // Refund wallet fee if rejected (idempotent)
    if (
      body.status === 'rejected' &&
      (doc as any).paidVia === 'wallet' &&
      Number((doc as any).feeAtSubmission ?? 0) > 0 &&
      !(doc as any).refundedAt
    ) {
      const amount = Number((doc as any).feeAtSubmission ?? 0);
      try {
        await this.userService.addToBalance((doc as any).userId?.toString?.() ?? (doc as any).userId, amount);
        await this.verificationService.findByIdAndUpdate(id, {
          refundedAt: new Date(),
          refundedAmount: amount,
        } as any);
      } catch (_) {
        // If refund fails, do not mark it as refunded
      }
    }

    if (body.status === 'approved') {
      const months = Number((doc as any).feeDurationMonths ?? 12);
      await this.verifyUser((doc as any).userId, months);
    }

    const updated = await this.verificationService.findByIdAndUpdate(id, {
      status: body.status,
      note: body.note ?? null,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
    });

    return {
      message: `Application ${body.status}`,
      application: updated,
    };
  }

  // ================= Seller Applications =================
  async getSellerApplications(dto: any) {
    let paginationParameters = new PaginationParameters({
      query: {
        limit: 50,
        page: 1,
        sort: "-_id",
        ...dto,
      },
    }).get();
    const filter: any = { ...dto };
    delete filter["limit"]; delete filter["page"]; delete filter["sort"]; 
    paginationParameters[0] = filter;

    const res = await this.sellerApplicationsService.paginate(paginationParameters as any);

    const docs = await Promise.all(
      res.docs.map(async (r: any) => {
        let userBasic: any = null;
        try {
          const u = await this.userService.findById(r.userId, "fullName email userImage roles verifiedAt");
          userBasic = u ? {
            _id: u._id,
            fullName: u.fullName,
            email: u.email,
            userImage: u.userImage,
            isSeller: Array.isArray(u.roles) && u.roles.includes(UserRole.Seller),
          } : null;
        } catch (e) {}
        return {
          ...r.toObject?.() ?? r,
          userBasic,
        };
      })
    );

    return {
      ...res,
      docs,
    };
  }

  async getSellerApplicationById(id: string) {
    const doc = await this.sellerApplicationsService.findById(id);
    if (!doc) throw new NotFoundException("Seller application not found");
    let userBasic: any = null;
    try {
      const u = await this.userService.findById(doc.userId, "fullName email userImage roles verifiedAt");
      userBasic = u ? {
        _id: u._id,
        fullName: u.fullName,
        email: u.email,
        userImage: u.userImage,
        isSeller: Array.isArray(u.roles) && u.roles.includes(UserRole.Seller),
      } : null;
    } catch (e) {}
    return {
      ...(doc.toObject?.() ?? (doc as any)),
      userBasic,
    };
  }

  async reviewSellerApplication(
    id: string,
    body: { status: 'approved' | 'rejected'; note?: string },
    reviewerId: string,
  ) {
    const doc = await this.sellerApplicationsService.findById(id);
    if (!doc) throw new NotFoundException("Seller application not found");

    if (body.status === 'approved') {
      const user = await this.userService.findByIdOrThrow(doc.userId);
      const roles = new Set<UserRole>(user.roles || []);
      roles.add(UserRole.Seller);
      await this.userAdminService.updateUserData(doc.userId, { roles: Array.from(roles) });
    }

    const updated = await this.sellerApplicationsService.findByIdAndUpdate(id, {
      status: body.status,
      note: body.note ?? null,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
    });

    if (body.status === 'rejected') {
      try {
        const tokens = await this.userDeviceService.getUserPushTokens(doc.userId);
        const reason = (body.note ?? '').toString().trim();
        const title = 'Seller Application Rejected';
        const bodyText = reason.length === 0
          ? 'Your seller application was rejected. Please review requirements and apply again.'
          : `Your seller application was rejected. Reason: ${reason}`;
        const data = {
          type: 'seller_application',
          status: 'rejected',
          reason: reason,
          applicationId: id,
        } as any;
        if (tokens.fcm && tokens.fcm.length) {
          await this.notificationEmitterService.fcmSend(new NotificationData({
            tokens: tokens.fcm,
            title,
            body: bodyText,
            tag: 'seller_application',
            data,
          }));
        }
        if (tokens.oneSignal && tokens.oneSignal.length) {
          await this.notificationEmitterService.oneSignalSend(new NotificationData({
            tokens: tokens.oneSignal,
            title,
            body: bodyText,
            tag: 'seller_application',
            data,
          }));
        }
      } catch (e) {
        console.log('[SellerApplication][Reject][Push] Failed to send push:', e?.message || e);
      }
    }

    if (body.status === 'approved') {
      try {
        const tokens = await this.userDeviceService.getUserPushTokens(doc.userId);
        const title = 'Seller Application Approved';
        const bodyText = 'Congratulations! Your seller application has been approved.';
        const data = {
          type: 'seller_application',
          status: 'approved',
          applicationId: id,
        } as any;
        if (tokens.fcm && tokens.fcm.length) {
          await this.notificationEmitterService.fcmSend(new NotificationData({
            tokens: tokens.fcm,
            title,
            body: bodyText,
            tag: 'seller_application',
            data,
          }));
        }
        if (tokens.oneSignal && tokens.oneSignal.length) {
          await this.notificationEmitterService.oneSignalSend(new NotificationData({
            tokens: tokens.oneSignal,
            title,
            body: bodyText,
            tag: 'seller_application',
            data,
          }));
        }
      } catch (e) {
        console.log('[SellerApplication][Approve][Push] Failed to send push:', e?.message || e);
      }
    }

    return {
      message: `Application ${body.status}`,
      application: updated,
    };
  }

  async deleteSellerApplication(id: string) {
    const doc = await this.sellerApplicationsService.findById(id);
    if (!doc) throw new NotFoundException("Seller application not found");
    await this.sellerApplicationsService.findByIdAndDelete(id);
    return "Seller application deleted";
  }

  async deleteVerificationApplication(id: string) {
    const doc = await this.verificationService.findById(id);
    if (!doc) throw new NotFoundException("Verification application not found");
    await this.verificationService.findByIdAndDelete(id);
    return "Verification application deleted";
  }

  // ================= Emergency Contacts =================
  async getEmergencyContacts(dto: any) {
    let paginationParameters = new PaginationParameters({
      query: {
        limit: 50,
        page: 1,
        sort: "-createdAt",
        ...dto,
      },
    }).get();
    const filter: any = { ...dto };
    delete filter["limit"]; delete filter["page"]; delete filter["sort"];
    paginationParameters[0] = filter;

    const res = await this.emergencyContactService.paginate(paginationParameters as any);

    // Enrich with basic user info
    const docs = await Promise.all(
      res.docs.map(async (r: any) => {
        let userBasic: any = null;
        try {
          const u = await this.userService.findById(r.userId, "fullName email userImage");
          userBasic = u ? {
            _id: u._id,
            fullName: u.fullName,
            email: u.email,
            userImage: u.userImage,
          } : null;
        } catch (e) {}
        return {
          ...r.toObject?.() ?? r,
          userBasic,
        };
      })
    );

    return {
      ...res,
      docs,
    };
  }

  // ================= Driver Applications =================
  async getDriverApplications(dto: any) {
    let paginationParameters = new PaginationParameters({
      query: {
        limit: 50,
        page: 1,
        sort: "-_id",
        ...dto,
      },
    }).get();
    const filter: any = { ...dto };
    delete filter["limit"]; delete filter["page"]; delete filter["sort"]; 
    paginationParameters[0] = filter;

    const res = await this.driverApplicationsService.paginate(paginationParameters as any);

    // Enrich with basic user info
    const docs = await Promise.all(
      res.docs.map(async (r: any) => {
        let userBasic: any = null;
        try {
          const u = await this.userService.findById(r.userId, "fullName email userImage roles verifiedAt");
          userBasic = u ? {
            _id: u._id,
            fullName: u.fullName,
            email: u.email,
            userImage: u.userImage,
            hasBadge: Array.isArray(u.roles) && u.roles.includes(UserRole.HasBadge),
            verifiedAt: u.verifiedAt,
          } : null;
        } catch (e) {}
        return {
          ...r.toObject?.() ?? r,
          userBasic,
        };
      })
    );

    return {
      ...res,
      docs,
    };
  }

  async getDriverApplicationById(id: string) {
    const doc = await this.driverApplicationsService.findById(id);
    if (!doc) throw new NotFoundException("Driver application not found");
    let userBasic: any = null;
    try {
      const u = await this.userService.findById(doc.userId, "fullName email userImage roles verifiedAt");
      userBasic = u ? {
        _id: u._id,
        fullName: u.fullName,
        email: u.email,
        userImage: u.userImage,
        hasBadge: Array.isArray(u.roles) && u.roles.includes(UserRole.HasBadge),
        verifiedAt: u.verifiedAt,
      } : null;
    } catch (e) {}
    return {
      ...(doc.toObject?.() ?? (doc as any)),
      userBasic,
    };
  }

  async reviewDriverApplication(
    id: string,
    body: { status: 'approved' | 'rejected'; note?: string },
    reviewerId: string,
  ) {
    const doc = await this.driverApplicationsService.findById(id);
    if (!doc) throw new NotFoundException("Driver application not found");

    // Refund wallet fee if rejected (idempotent)
    if (
      body.status === 'rejected' &&
      (doc as any).paidVia === 'wallet' &&
      Number((doc as any).feeAtSubmission ?? 0) > 0 &&
      !(doc as any).refundedAt
    ) {
      const amount = Number((doc as any).feeAtSubmission ?? 0);
      try {
        await this.userService.addToBalance((doc as any).userId?.toString?.() ?? (doc as any).userId, amount);
        await this.driverApplicationsService.findByIdAndUpdate(id, {
          refundedAt: new Date(),
          refundedAmount: amount,
        } as any);
      } catch (_) {
        // If refund fails, do not mark it as refunded
      }
    }

    if (body.status === 'approved') {
      // Add Driver role to the user
      const user = await this.userService.findByIdOrThrow(doc.userId);
      const roles = new Set<UserRole>(user.roles || []);
      roles.add(UserRole.Driver);
      await this.userAdminService.updateUserData(doc.userId, { roles: Array.from(roles) });
    }

    const updated = await this.driverApplicationsService.findByIdAndUpdate(id, {
      status: body.status,
      note: body.note ?? null,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
    });

    // If rejected, send a push notification to the applicant with the reason
    if (body.status === 'rejected') {
      try {
        const tokens = await this.userDeviceService.getUserPushTokens(doc.userId);
        const reason = (body.note ?? '').toString().trim();
        const refunded = (doc as any).paidVia === 'wallet' && Number((doc as any).feeAtSubmission ?? 0) > 0;
        const title = 'Driver Application Rejected';
        let bodyText = reason.length === 0 ? 'Your driver application was rejected. Please review requirements and apply again.' : `Your driver application was rejected. Reason: ${reason}`;
        if (refunded) {
          bodyText += ` KSh ${Number((doc as any).feeAtSubmission ?? 0).toFixed(2)} has been refunded to your wallet.`;
        }
        const data = {
          type: 'driver_application',
          status: 'rejected',
          reason: reason,
          applicationId: id,
        } as any;
        if (tokens.fcm && tokens.fcm.length) {
          await this.notificationEmitterService.fcmSend(new NotificationData({
            tokens: tokens.fcm,
            title,
            body: bodyText,
            tag: 'driver_application',
            data,
          }));
        }
        if (tokens.oneSignal && tokens.oneSignal.length) {
          await this.notificationEmitterService.oneSignalSend(new NotificationData({
            tokens: tokens.oneSignal,
            title,
            body: bodyText,
            tag: 'driver_application',
            data,
          }));
        }
      } catch (e) {
        // log only, do not fail review flow
        console.log('[DriverApplication][Reject][Push] Failed to send push:', e?.message || e);
      }
    }

    // If approved, send a push notification to the applicant
    if (body.status === 'approved') {
      try {
        const tokens = await this.userDeviceService.getUserPushTokens(doc.userId);
        const title = 'Driver Application Approved';
        const bodyText = 'Congratulations! Your driver application has been approved.';
        const data = {
          type: 'driver_application',
          status: 'approved',
          applicationId: id,
        } as any;
        if (tokens.fcm && tokens.fcm.length) {
          await this.notificationEmitterService.fcmSend(new NotificationData({
            tokens: tokens.fcm,
            title,
            body: bodyText,
            tag: 'driver_application',
            data,
          }));
        }
        if (tokens.oneSignal && tokens.oneSignal.length) {
          await this.notificationEmitterService.oneSignalSend(new NotificationData({
            tokens: tokens.oneSignal,
            title,
            body: bodyText,
            tag: 'driver_application',
            data,
          }));
        }
      } catch (e) {
        console.log('[DriverApplication][Approve][Push] Failed to send push:', e?.message || e);
      }
    }

    return {
      message: `Application ${body.status}`,
      application: updated,
    };
  }

  async updateGift(
    giftId: string,
    data: {
      name?: string;
      description?: string;
      price?: number;
      isActive?: boolean;
    },
    imageFile?: any
  ) {
    const updateData: any = { ...data };

    if (imageFile) {
      const uploaderDto = new CreateS3UploaderDto();
      uploaderDto.mediaBuffer = imageFile.buffer;
      uploaderDto.fileName = imageFile.originalname;
      uploaderDto.myUser = { _id: "admin" } as any;
      updateData.imageUrl = await this.fileUploaderService.uploadChatMedia(
        uploaderDto
      );
    }

    const gift = await this.giftService.findByIdAndUpdate(giftId, updateData);

    if (!gift) {
      throw new Error("Gift not found");
    }

    return {
      id: gift._id.toString(),
      name: gift.name,
      description: gift.description,
      imageUrl: gift.imageUrl,
      price: gift.price,
      isActive: gift.isActive,
      createdAt: gift.createdAt,
      updatedAt: gift.updatedAt,
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
      updatedAt: gift.updatedAt,
    };
  }
}
