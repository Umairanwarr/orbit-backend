/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { UserService } from "../user_modules/user/user.service";
import { remove } from "remove-accents";

import bcrypt from "bcrypt";
import { UserDeviceService } from "../user_modules/user_device/user_device.service";
import { UserBanService } from "../user_modules/user_ban/user_ban.service";
import { IUser } from "../user_modules/user/entities/user.entity";
import { VersionsService } from "../versions/versions.service";
import { FileUploaderService } from "../../common/file_uploader/file_uploader.service";
import { MongoIdDto } from "../../core/common/dto/mongo.id.dto";
import UpdatePasswordDto from "./dto/update_password_dto";
import CheckVersionDto from "./dto/check-version.dto";
import {
  UpdateChatReqStatusDto,
  UpdateMyBioDto,
  UpdateMyNameDto,
  UpdateMyPasswordDto,
  UpdateMyPhoneNumberDto,
  UpdateMyPrivacyDto,
} from "./dto/update.my.name.dto";
import { AppConfigService } from "../app_config/app_config.service";
import { MongoPeerIdDto } from "../../core/common/dto/mongo.peer.id.dto";
import { RoomMemberService } from "../../chat/room_member/room_member.service";
import { GroupMemberService } from "../../chat/group_member/group_member.service";
import { BroadcastMemberService } from "../../chat/broadcast_member/broadcast_member.service";
import { UserVersionService } from "../user_modules/user_version/user_version.service";
import { CreateReportSystemDto } from "../report_system/dto/create-report_system.dto";
import { ReportSystemService } from "../report_system/report_system.service";
import { AdminNotificationService } from "../admin_notification/admin_notification.service";
import { SocketIoService } from "../../chat/socket_io/socket_io.service";
import { AuthService } from "../auth/auth.service";
import { PaginationParameters } from "mongoose-paginate-v2";
import { NotificationEmitterService } from "../../common/notification_emitter/notification_emitter.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  ChatRequestStatus,
  Platform,
  PushTopics,
  RoomType,
  UserRole,
  MailType,
} from "../../core/utils/enums";
import { i18nApi } from "../../core/utils/res.helpers";
import { ChatRequestService } from "../../chat/chat_request/chat_request.service";
import { ChannelService } from "../../chat/channel/services/channel.service";
import { ProfileNotificationEmitter } from "./profile_notification_emitter";
import { UserSearchFilterDto } from "./dto/user-search-filter.dto";
import { BanService } from "../ban/ban.service";
import { UpdateMyGenderDto } from "./dto/update-my-gender.dto";
import { UpdateMyLocationDto } from "./dto/update-my-location.dto";
import { UpdateMyProfessionDto } from "./dto/update.my.name.dto";
import { InjectModel } from "@nestjs/mongoose";
import mongoose, { Model } from "mongoose";
import { isUUID } from "class-validator";
import { SendMailEvent } from "../../core/utils/interfaceces";
import { VerificationService } from "../verification/verification.service";
import { AdsService } from "../ads/ads.service";
import { EmergencyContactService } from "../user_modules/emergency_contact/emergency_contact.service";
import { UserFollowService } from "../user_modules/user_follow/user_follow.service";
import { WithdrawRequestsService } from "../wallet/withdraw_requests.service";
import { PesapalService } from "../payments/pesapal/pesapal.service";

@Injectable()
export class ProfileService {
  constructor(
    private readonly userService: UserService,
    private readonly userDevice: UserDeviceService,
    private readonly authService: AuthService,
    private readonly banServer: UserBanService,
    private readonly ioService: SocketIoService,
    private s3: FileUploaderService,
    private notificationEmitterService: NotificationEmitterService,
    private versionsService: VersionsService,
    private appConfigService: AppConfigService,
    private reportSystemService: ReportSystemService,
    private readonly roomMemberService: RoomMemberService,
    private readonly groupMember: GroupMemberService,
    private readonly userVersion: UserVersionService,
    private readonly broadcastMember: BroadcastMemberService,
    private readonly adminNotificationService: AdminNotificationService,
    private readonly chatRequestService: ChatRequestService,
    private readonly channelService: ChannelService,
    private readonly profileNotificationEmitter: ProfileNotificationEmitter,
    private readonly eventEmitter: EventEmitter2,
    private readonly verificationService: VerificationService,
    private readonly adsService: AdsService,
    private readonly emergencyContactService: EmergencyContactService,
    private readonly userFollowService: UserFollowService,
    private readonly withdrawRequestsService: WithdrawRequestsService,
    private readonly pesapalService: PesapalService,
    @InjectModel("users") private readonly userModel: Model<IUser>,
    @InjectModel('AdSubmission') private readonly adSubmissionModel: Model<any>,
  ) { }

  private _normalizePhoneNumber(raw: string) {
    const v = (raw || '').toString().trim();
    if (!v) return '';
    const digits = v.replace(/\D/g, '');
    if (!digits) return '';
    if (v.startsWith('00')) {
      const d = digits.startsWith('00') ? digits.substring(2) : digits;
      return d;
    }
    if (v.startsWith('+')) {
      return digits;
    }
    return digits;
  }

  async resolvePhoneToUserId(rawPhone: string) {
    const phone = this._normalizePhoneNumber(rawPhone);
    if (!phone) {
      throw new BadRequestException('Phone number is required');
    }

    const regexDigits = phone.split('').join('[\\s\\-()]*');
    const phoneRegex = new RegExp(`^\\s*\\+?${regexDigits}\\s*$`);

    const user = await this.userModel
      .findOne(
        {
          $and: [
            {
              $or: [
                { phoneNumber: { $regex: phoneRegex } },
                { email: { $regex: phoneRegex } },
              ],
            },
            {
              $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
            },
          ],
        },
        '_id'
      )
      .lean();
    if (!user) {
      throw new NotFoundException("Account doesn't exist on Orbit");
    }
    return { userId: user._id };
  }

  async updateMyGender(dto: UpdateMyGenderDto) {
    const user = await this.userService.findById(dto.myUser._id);
    if (!user) {
      throw new BadRequestException("User not found");
    }

    await this.userService.findByIdAndUpdate(dto.myUser._id, {
      gender: dto.gender,
    });

    // Return updated user document
    return this.userService.findById(dto.myUser._id);
  }

  async updateMyLocation(dto: UpdateMyLocationDto) {
    try {
      console.log('Update location DTO:', JSON.stringify(dto, null, 2));

      if (!dto.myUser || !dto.myUser._id) {
        throw new BadRequestException("User not authenticated. Missing user information in request.");
      }

      const userId = dto.myUser._id;
      console.log('Updating location for user ID:', userId);

      const user = await this.userService.findById(userId);
      if (!user) {
        throw new BadRequestException("User not found in database");
      }

      console.log('Found user in database. Updating location...');

      const updateData = {
        latitude: dto.latitude,
        longitude: dto.longitude,
        locationUpdatedAt: new Date(),
      };

      console.log('Update data:', JSON.stringify(updateData, null, 2));

      await this.userService.findByIdAndUpdate(userId, updateData);
      console.log('Location updated successfully');

      const updatedUser = await this.userService.findById(userId);

      return {
        message: "Location updated successfully",
        user: updatedUser,
      };
    } catch (error) {
      console.error('Error in updateMyLocation:', error);
      throw error; // Re-throw to be handled by the global exception filter
    }
  }

  async getUsersSearch(searchFilters: UserSearchFilterDto, myUser: IUser) {
    // Get banned user IDs (existing logic)
    let bannedUserIds = await this.banServer.getMyBlockTheyAndMe(myUser._id);
    bannedUserIds.push(myUser._id); // Exclude current user

    // Perform filtered search
    const result = await this.userService.searchWithFilters(
      searchFilters,
      bannedUserIds,
      myUser
    );

    // Enforce profile image visibility for list results
    const viewerId = myUser._id?.toString?.() ?? String(myUser._id);
    const maskedUsers = (result.users || []).map((u: any) => {
      const allowList = u?.userPrivacy?.profilePicAllowedUsers as string[] | undefined;
      const blockList = u?.userPrivacy?.profilePicBlockedUsers as string[] | undefined;
      const isRestricted = Array.isArray(allowList) && allowList.length > 0;
      const isBlocked = Array.isArray(blockList) && blockList.map(String).includes(String(viewerId));
      const canAddToGroup = (u?.userPrivacy?.groupAddPermission ?? 'public') === 'public';
      if (isBlocked && viewerId !== String(u._id)) {
        return { ...u, userImage: "/v-public/default_user_image.png", canAddToGroup };
      }
      if (isRestricted && !allowList!.map(String).includes(String(viewerId)) && viewerId !== String(u._id)) {
        return { ...u, userImage: "/v-public/default_user_image.png", canAddToGroup };
      }
      return { ...u, canAddToGroup };
    });
    return { ...result, users: maskedUsers };
  }

  async getMyProfile(user: IUser) {
    let res = {};
    res["me"] = await this.userService.findById(user._id, "-lastMail");
    res["currentDevice"] = await this.userDevice.findById(
      user.currentDevice._id,
      "platform language clintVersion"
    );
    return res;
  }

  async getPublicProfile(dto: MongoIdDto) {
    let user = await this.userService.findByIdOrThrow(
      dto.id,
      "userImage fullName bio roles createdAt userPrivacy"
    );
    const restrictList = (user as any)?.userPrivacy?.profilePicAllowedUsers as
      | string[]
      | undefined;
    const isRestricted = Array.isArray(restrictList) && restrictList.length > 0;
    // Public endpoint has no viewer context; if restricted, hide image
    const safeUserImage = isRestricted
      ? "/v-public/default_user_image.png"
      : user.userImage;
    return {
      userImage: safeUserImage,
      fullName: user.fullName,
      bio: user.bio,
      hasBadge: user.roles.includes(UserRole.HasBadge),
      createdAt: user.createdAt,
      _id: user._id,
    };
  }

  async getPeerProfile(dto: MongoIdDto) {
    let res = {};
    let user = await this.userService.findByIdOrThrow(
      dto.id,
      "userImage fullName email userPrivacy bio phoneNumber profession lastSeenAt createdAt roles"
    );
    let chatReq = await this.chatRequestService.findOne({
      $or: [{ receiverId: dto.myUser._id }, { senderId: dto.myUser._id }],
      roomType: RoomType.Single,
    });

    // Find mutual groups between current user and peer
    const mutualGroups = await this.getMutualGroups(dto.myUser._id, dto.id);

    // Enforce profile image visibility for peer profile
    const allowedList = (user as any)?.userPrivacy?.profilePicAllowedUsers as string[] | undefined;
    const blockedList = (user as any)?.userPrivacy?.profilePicBlockedUsers as string[] | undefined;
    const isRestricted = Array.isArray(allowedList) && allowedList.length > 0;
    const viewerId = dto.myUser?._id?.toString?.() ?? String(dto.myUser?._id);
    const isBlocked = Array.isArray(blockedList) && blockedList.map(String).includes(String(viewerId));
    const canViewProfileImage = !isBlocked && (
      !isRestricted || allowedList!.map(String).includes(String(viewerId)) || viewerId === String(dto.id)
    );

    const [isFollowing, followCounts, bans, isOnline] = await Promise.all([
      this.userFollowService.isFollowing(dto.myUser._id, dto.id),
      this.userFollowService.getCounts(dto.id),
      this.banServer.checkBans(new MongoPeerIdDto(dto.id, dto.myUser)),
      this.ioService.checkIfUserOnline(dto.id),
    ]);

    res = {
      ...user,
      userImage: canViewProfileImage ? user.userImage : "/v-public/default_user_image.png",
      hasBadge: user.roles.includes(UserRole.HasBadge),
      ...bans,
      isOnline: isOnline,
      chatReq: chatReq,
      mutualGroups: mutualGroups,
      canViewProfileImage,
      isFollowing,
      followersCount: followCounts.followersCount,
      followingCount: followCounts.followingCount,
    };
    return res;
  }

  async updateMyName(dto: UpdateMyNameDto) {
    await this.userService.findByIdAndUpdate(dto.myUser._id, {
      fullName: dto.fullName,
      fullNameEn: remove(dto.fullName),
    });
    await this.roomMemberService.updateMany(
      {
        pId: dto.myUser._id,
      },
      {
        t: dto.fullName,
        tEn: remove(dto.fullName),
      }
    );
    await this.groupMember.updateMany(
      { uId: dto.myUser._id },
      {
        "userData.fullName": dto.fullName,
        "userData.fullNameEn": remove(dto.fullName),
      }
    );
    await this.broadcastMember.updateMany(
      { uId: dto.myUser._id },
      {
        "userData.fullName": dto.fullName,
        "userData.fullNameEn": remove(dto.fullName),
      }
    );
    return dto.fullName;
  }

  async updateMyImage(file: any, myUser: IUser) {
    let res = await this.s3.putImageCropped(file.buffer, myUser._id);
    await this.userService.findByIdAndUpdate(myUser._id, {
      userImage: res,
    });

    await this.roomMemberService.updateMany(
      {
        pId: myUser._id,
      },
      {
        img: res,
      }
    );
    await this.groupMember.updateMany(
      { uId: myUser._id },
      {
        "userData.userImages": res,
      }
    );
    await this.broadcastMember.updateMany(
      { uId: myUser._id },
      {
        "userData.userImages": res,
      }
    );
    return res;
  }

  async deleteFcmFor(user: IUser) {
    await this.userDevice.findByIdAndUpdate(user.currentDevice._id, {
      pushKey: null,
    });
    return "Fcm deleted";
  }

  async addPushKey(myUser: IUser, pushKey?: string, voipKey?: string) {
    const updateObject: { pushKey?: string; voipKey?: string } = {};
    if (pushKey) {
      updateObject.pushKey = pushKey;
    }

    if (voipKey) {
      updateObject.voipKey = voipKey;
    }

    await this.userDevice.findByIdAndUpdate(
      myUser.currentDevice._id,
      updateObject
    );

    // Subscribe the device token to admin notification topics so the user receives admin pushes
    try {
      if (pushKey) {
        const device = await this.userDevice.findById(
          myUser.currentDevice._id,
          "platform"
        );
        const isOneSignal = isUUID(pushKey.toString());
        if (device?.platform == Platform.Android) {
          if (isOneSignal) {
            await this.notificationEmitterService.subscribeOnesignalTopic(
              pushKey,
              PushTopics.AdminAndroid
            );
          } else {
            await this.notificationEmitterService.subscribeFcmTopic(
              pushKey,
              PushTopics.AdminAndroid
            );
          }
        }
        if (device?.platform == Platform.Ios) {
          if (isOneSignal) {
            await this.notificationEmitterService.subscribeOnesignalTopic(
              pushKey,
              PushTopics.AdminIos
            );
          } else {
            await this.notificationEmitterService.subscribeFcmTopic(
              pushKey,
              PushTopics.AdminIos
            );
          }
        }
      }
    } catch (e) {
      console.log("Failed to subscribe push topic:", e?.message || e);
    }

    return "PushKey added";
  }

  async updateLanguage(myUser: IUser, language: String) {
    await this.userDevice.findByIdAndUpdate(myUser.currentDevice._id, {
      language: language,
    });
    return "Language has been updated";
  }

  async updatePassword(user: IUser, dto: UpdatePasswordDto) {
    let foundedUser: IUser = await this.userService.findByIdOrThrow(
      dto.myUser._id,
      "+password"
    );
    let bcryptRes = await bcrypt.compare(dto.oldPassword, foundedUser.password);
    if (!bcryptRes) {
      throw new BadRequestException("Invalid password credentials");
    }

    if (dto.logoutFromAll) {
      await this.userDevice.deleteMany({
        uId: dto.myUser._id,
        _id: { $ne: dto.myUser.currentDevice._id },
      });
    }

    const salt = await bcrypt.genSalt(10);
    let hashed = bcrypt.hashSync(dto.newPassword, salt);
    await this.userService.findByIdAndUpdate(dto.myUser._id, {
      password: hashed,
    });
    return "Password changed successfully";
  }

  async updateFcm(user: IUser, pushKey: String) {
    let dId = user.currentDevice._id;
    await this.userDevice.findByIdAndUpdate(dId, {
      pushKey,
    });
    // Ensure topic subscription when the push key is updated post-login
    try {
      const device = await this.userDevice.findById(dId, "platform");
      const key = pushKey?.toString?.() || String(pushKey);
      if (key) {
        const isOneSignal = isUUID(key);
        if (device?.platform == Platform.Android) {
          if (isOneSignal) {
            await this.notificationEmitterService.subscribeOnesignalTopic(
              key,
              PushTopics.AdminAndroid
            );
          } else {
            await this.notificationEmitterService.subscribeFcmTopic(
              key,
              PushTopics.AdminAndroid
            );
          }
        }
        if (device?.platform == Platform.Ios) {
          if (isOneSignal) {
            await this.notificationEmitterService.subscribeOnesignalTopic(
              key,
              PushTopics.AdminIos
            );
          } else {
            await this.notificationEmitterService.subscribeFcmTopic(
              key,
              PushTopics.AdminIos
            );
          }
        }
      }
    } catch (e) {
      console.log(
        "Failed to subscribe push topic on updateFcm:",
        e?.message || e
      );
    }
    return "updated!";
  }

  async getUsersAndSearch(dto: Object, myUser: IUser) {
    let bans = await this.banServer.getMyBlockTheyAndMe(myUser._id);
    bans.push(myUser._id);
    return this.userService.searchV2(dto, bans);
  }

  async setVisit(user: IUser) {
    await this.userDevice.findByIdAndUpdate(user.currentDevice._id, {
      $inc: {
        visits: 1,
      },
    });
    return "Done";
  }

  async getMyDevices(user) {
    return this.userDevice.findAll({
      uId: user._id,
    });
  }

  async getAppConfig(user) {
    return this.appConfigService.getConfig();
  }

  async getUserLastSeenAt(dto: MongoPeerIdDto) {
    let user = await this.userService.findByIdOrThrow(
      dto.peerId,
      "lastSeenAt userPrivacy"
    );
    if (user.userPrivacy.lastSeen == false) return null;
    return user.lastSeenAt;
  }

  async deleteMyAccount(user: IUser, password: string) {
    //stop notifications
    await this.checkPassword(user, password);
    await this.userService.findByIdAndUpdate(user._id, {
      deletedAt: new Date(),
    });
    try {
      let device = await this.userDevice.findById(user.currentDevice._id);
      if (device.platform == Platform.Android) {
        this.notificationEmitterService
          .unSubscribeFcmTopic(device.pushKey ?? "--", PushTopics.AdminAndroid)
          .then((value) => { });
      }
      if (device.platform == Platform.Ios) {
        this.notificationEmitterService
          .unSubscribeFcmTopic(device.pushKey ?? "--", PushTopics.AdminIos)
          .then((value) => { });
      }
    } catch (e) {
      console.log(e);
    }
    return "account deleted !";
  }

  async checkVersion(dto: CheckVersionDto) {
    return this.userVersion.checkVersion(dto);
  }

  async createReport(dto: CreateReportSystemDto) {
    // Persist the report
    const created = await this.reportSystemService.create({
      ...dto,
      uId: dto.myUser._id,
    });

    const createdReport = Array.isArray(created) ? created[0] : created;

    // Fetch reporter and target basic info for notifications/email
    const reporter = await this.userService.findById(dto.myUser._id, "fullName email");
    const target = await this.userService.findById(dto.targetId, "fullName email");

    // Do NOT create admin notifications or push notifications for reports

    // Emit email event to admin SMTP using MailType.ReportUser
    try {
      const info = {
        reporterName: reporter?.fullName,
        reporterEmail: reporter?.email,
        reporterId: dto.myUser._id,
        targetName: target?.fullName,
        targetEmail: target?.email,
        targetId: dto.targetId,
        type: dto.type,
        content: dto.content,
        createdAt: new Date().toISOString(),
      };
      const mailEvent = new SendMailEvent();
      mailEvent.mailType = MailType.ReportUser;
      mailEvent.user = reporter as any; // only used for logging fallback
      mailEvent.text = JSON.stringify(info);
      this.eventEmitter.emit("send.mail", mailEvent);
    } catch (e) {
      // ignore email emit errors
    }

    return createdReport;
  }

  async getAdminNotification(dto: Object) {
    let paginationParameters = new PaginationParameters({
      query: {
        limit: 20,
        page: 1,
        sort: "-_id",
        ...dto,
      },
    }).get();
    if (paginationParameters[1].page <= 0) {
      paginationParameters[1].page = 1;
    }
    if (
      paginationParameters[1].limit <= 0 ||
      paginationParameters[1].limit >= 50
    ) {
      paginationParameters[1].limit = 20;
    }
    return this.adminNotificationService.paginate(paginationParameters);
  }

  async updateMyBio(dto: UpdateMyBioDto) {
    await this.userService.findByIdAndUpdate(dto.myUser._id, {
      bio: dto.bio,
    });
    return dto.bio;
  }

  async updateMyProfession(dto: UpdateMyProfessionDto) {
    await this.userService.findByIdAndUpdate(dto.myUser._id, {
      profession: dto.profession,
    });
    return dto.profession;
  }

  async updateMyPhoneNumber(dto: UpdateMyPhoneNumberDto) {
    await this.userService.findByIdAndUpdate(dto.myUser._id, {
      phoneNumber: dto.phoneNumber,
    });
    return dto.phoneNumber;
  }

  async updateMyPassword(dto: UpdateMyPasswordDto) {
    let foundedUser: IUser = await this.userService.findById(
      dto.myUser._id,
      "+password userDevice lastMail banTo email registerStatus"
    );
    await this.authService.comparePassword(
      dto.oldPassword,
      foundedUser.password
    );
    await this.userService.findByIdAndUpdate(dto.myUser._id, {
      password: dto.newPassword,
    });
    if (dto.logoutAll) {
      let currentDeviceId = dto.myUser.currentDevice._id;
      await this.userDevice.deleteMany({
        _id: { $ne: currentDeviceId },
        uId: dto.myUser._id,
      });
    }
    return "Done";
  }

  async deleteDevice(dto: MongoIdDto, password: string) {
    if (dto.myUser.currentDevice._id.toString() == dto.id)
      throw new BadRequestException("You cant delete your device");
    await this.checkPassword(dto.myUser, password);
    await this.userDevice.findByIdAndDelete(dto.id);
    return "Device deleted";
  }

  async getMyBlocked(user: IUser, dto: Object) {
    return await this.banServer.getMyBlockMeOnly(user._id, dto);
  }

  async checkPassword(user: IUser, password: string) {
    if (!password) throw new BadRequestException("password is required");
    let foundedUser: IUser = await this.userService.findByIdOrThrow(
      user._id,
      "+password userDevice lastMail banTo email registerStatus deletedAt"
    );
    await this.comparePassword(password, foundedUser.password);
    return true;
  }

  async comparePassword(dtoPassword, dbHasPassword) {
    let bcryptRes = await bcrypt.compare(dtoPassword, dbHasPassword);
    if (!bcryptRes) {
      throw new BadRequestException(i18nApi.invalidLoginDataString);
    }
    return true;
  }

  async updateMyPrivacy(dto: UpdateMyPrivacyDto) {
    await this.userService.findByIdAndUpdate(dto.myUser._id, {
      userPrivacy: dto,
    });
    return this.userService.findByIdOrThrow(dto.myUser._id);
  }

  async sendChatRequest(dto: MongoIdDto) {
    if (dto.id == dto.myUser._id)
      throw new BadRequestException("You can not send request to your self");
    let oldChatReq = await this.chatRequestService.findOne({
      $or: [{ receiverId: dto.myUser._id }, { senderId: dto.myUser._id }],
      roomType: RoomType.Single,
    });
    if (oldChatReq && oldChatReq.status != ChatRequestStatus.Canceled)
      throw new BadRequestException(
        "Old request already " + oldChatReq.roomType + " " + oldChatReq.status
      );
    let room = await this.channelService.getOrCreatePeerRoom({
      myUser: dto.myUser,
      peerId: dto.id,
    });
    if (!oldChatReq) {
      await this.chatRequestService.create({
        senderId: dto.myUser._id,
        receiverId: dto.id,
        status: ChatRequestStatus.Pending,
        roomType: RoomType.Single,
        roomId: room.rId,
      });
      await this.profileNotificationEmitter.notify(dto.id, dto.myUser);
    } else {
      await this.chatRequestService.findByIdAndUpdate(oldChatReq._id, {
        status: ChatRequestStatus.Pending,
      });
    }

    return "Request has been send";
  }

  async updateChatRequest(dto: MongoIdDto, status: UpdateChatReqStatusDto) {
    let chatReq = await this.chatRequestService.findByIdOrThrow(dto.id);
    if (
      chatReq.senderId.toString() != dto.myUser._id &&
      chatReq.receiverId.toString() != dto.myUser._id
    )
      throw new BadRequestException("You dont have access");
    if (dto.myUser._id.toString() == chatReq.senderId.toString()) {
      ///iam the sender
      if (status.status == ChatRequestStatus.Refused)
        throw new BadRequestException("As sender you can not Refused");
      if (status.status == ChatRequestStatus.Pending)
        throw new BadRequestException("As sender you can not Pending");
      if (status.status == ChatRequestStatus.Accepted)
        throw new BadRequestException("As sender you can not Accepted");
    }
    if (dto.myUser._id.toString() == chatReq.receiverId.toString()) {
      ///iam the receiver
      if (status.status == ChatRequestStatus.Canceled)
        throw new BadRequestException("As receiver you can not Canceled");
      if (status.status == ChatRequestStatus.Pending)
        throw new BadRequestException("As receiver you can not Pending");
    }

    await this.chatRequestService.findByIdAndUpdate(dto.id, {
      status: status.status,
    });
    return "Status has been updated";
  }

  async getMyChatRequest(user: IUser, dto: object) {
    let filter: object = {
      receiverId: user._id,
      status: { $eq: ChatRequestStatus.Pending },
    };
    let paginationParameters = new PaginationParameters({
      query: {
        limit: 30,
        sort: "-_id",
        ...dto,
      },
    }).get();
    paginationParameters[0] = filter;
    return this.chatRequestService.paginate(paginationParameters);
  }

  async getUserLoyaltyPoints(user: IUser) {
    return {
      loyaltyPoints: user.loyaltyPoints || 0,
    };
  }

  async createWithdrawRequest(
    user: IUser,
    body: { amount: number; phone: string },
  ) {
    const amount = Number(body?.amount);
    const phone = (body?.phone || "").toString().trim();
    if (!amount || amount <= 0) {
      throw new BadRequestException("amount must be greater than 0");
    }
    if (!phone) {
      throw new BadRequestException("phone is required");
    }

    const balance = await this.userService.getUserBalance(user._id as any);
    let pendingTotal = 0;
    try {
      const pending: any[] = await this.withdrawRequestsService.findAll({
        userId: user._id.toString(),
        status: "pending",
      });
      pendingTotal = pending.reduce(
        (sum, r: any) => sum + (Number(r.amount) || 0),
        0,
      );
    } catch (e) { }

    if (amount > balance - pendingTotal) {
      throw new BadRequestException("Insufficient balance for withdrawal");
    }

    const created = await this.withdrawRequestsService.create({
      userId: user._id.toString(),
      amount,
      phone,
      status: "pending",
    });
    return Array.isArray(created) ? created[0] : created;
  }

  async getMyWithdrawRequests(user: IUser, dto: any) {
    const limitRaw = Number(dto?.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 100)
      : 30;
    const list = await this.withdrawRequestsService.findAll(
      { userId: user._id.toString() },
      { limit, sort: { createdAt: -1 } },
    );
    return list;
  }

  // ================= Emergency Contacts =================
  async getMyEmergencyContacts(user: IUser) {
    const list = await this.emergencyContactService.findAll({ userId: user._id }, null, { lean: true });
    return list;
  }

  async addMyEmergencyContact(user: IUser, body: { name: string; phone: string; relation?: string }) {
    const name = (body?.name || '').toString().trim();
    const phone = (body?.phone || '').toString().trim();
    const relation = (body?.relation || '').toString().trim() || null;
    if (!name || !phone) {
      throw new BadRequestException('name and phone are required');
    }
    const created = await this.emergencyContactService.create({ userId: user._id, name, phone, relation });
    return Array.isArray(created) ? created[0] : created;
  }

  async deleteMyEmergencyContact(user: IUser, id: string) {
    const found = await this.emergencyContactService.findById(id);
    if (!found || (found as any).userId?.toString?.() !== user._id.toString()) {
      throw new BadRequestException('contact not found');
    }
    await this.emergencyContactService.findByIdAndDelete(id);
    return { deleted: true };
  }

  // ================= Verification Requests =================
  async createVerificationRequest(myUser: IUser, body: {
    idImageUrl: string;
    selfieImageUrl: string;
    paymentReference?: string;
    paymentScreenshotUrl?: string;
    feePlan?: 'monthly' | 'six_months' | 'yearly';
  }) {
    if (!body?.idImageUrl || !body?.selfieImageUrl) {
      throw new BadRequestException("idImageUrl and selfieImageUrl are required");
    }
    const config = await this.appConfigService.getConfig();

    const monthlyFee = Number((config as any)?.verificationFeeMonthly ?? 0) || 0;
    const sixMonthsFee = Number((config as any)?.verificationFeeSixMonths ?? 0) || 0;
    const legacyYearlyFee = Number((config as any)?.verificationFee ?? 0) || 0;
    const yearlyFee = Number((config as any)?.verificationFeeYearly ?? legacyYearlyFee) || 0;

    const availablePlans: Array<{ plan: 'monthly' | 'six_months' | 'yearly'; months: number; fee: number }> = [];
    if (monthlyFee > 0) availablePlans.push({ plan: 'monthly', months: 1, fee: monthlyFee });
    if (sixMonthsFee > 0) availablePlans.push({ plan: 'six_months', months: 6, fee: sixMonthsFee });
    if (yearlyFee > 0) availablePlans.push({ plan: 'yearly', months: 12, fee: yearlyFee });

    let selectedPlan: 'monthly' | 'six_months' | 'yearly' = 'yearly';
    let selectedMonths = 12;
    let selectedFee = yearlyFee;

    if (body?.feePlan === 'monthly') {
      selectedPlan = 'monthly';
      selectedMonths = 1;
      selectedFee = monthlyFee;
    } else if (body?.feePlan === 'six_months') {
      selectedPlan = 'six_months';
      selectedMonths = 6;
      selectedFee = sixMonthsFee;
    } else if (body?.feePlan === 'yearly') {
      selectedPlan = 'yearly';
      selectedMonths = 12;
      selectedFee = yearlyFee;
    } else {
      if (availablePlans.length === 1) {
        selectedPlan = availablePlans[0].plan;
        selectedMonths = availablePlans[0].months;
        selectedFee = availablePlans[0].fee;
      } else {
        selectedPlan = 'yearly';
        selectedMonths = 12;
        selectedFee = yearlyFee;
      }
      if (selectedFee <= 0 && legacyYearlyFee > 0) {
        selectedFee = legacyYearlyFee;
      }
    }

    const created = await this.verificationService.create({
      userId: myUser._id,
      idImageUrl: body.idImageUrl,
      selfieImageUrl: body.selfieImageUrl,
      paymentReference: body.paymentReference,
      paymentScreenshotUrl: body.paymentScreenshotUrl,
      feePlan: selectedPlan,
      feeDurationMonths: selectedMonths,
      status: 'pending',
      feeAtSubmission: selectedFee,
      paidVia: body?.paymentReference ? 'mpesa' : (selectedFee > 0 ? 'wallet' : null),
    });

    const doc = Array.isArray(created) ? created[0] : created;

    // Wallet-based payment: deduct fee at submission if fee > 0 and no payment reference provided
    if (!body?.paymentReference && selectedFee > 0) {
      try {
        await this.userService.subtractFromBalanceAtomic(myUser._id.toString(), selectedFee);
      } catch (e) {
        // If deduction fails, mark request as rejected/failed-like and surface error
        try {
          await this.verificationService.findByIdAndUpdate((doc as any)._id?.toString?.() ?? (doc as any).id, {
            status: 'rejected',
            note: 'Insufficient balance',
          } as any);
        } catch (_) { }
        throw e;
      }
    }

    return doc;
  }

  async getMyLatestVerificationRequest(myUser: IUser) {
    return this.verificationService.latestForUser(myUser._id);
  }

  // ================= Two-Factor Authentication (Email) =================
  async getTwoFactorStatus(user: IUser) {
    const u = await this.userService.findById(user._id, "twoFactorEnabled");
    return { enabled: !!(u as any)?.twoFactorEnabled };
  }

  async requestTwoFactorCode(user: IUser) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await this.userService.findByIdAndUpdate(user._id, {
      twoFactorOTP: code,
      twoFactorOTPExpiry: expiry,
    });

    // Fetch user's email and fullName for mailing (req.user may not include email)
    const u = await this.userService.findById(user._id, "email fullName");

    // Emit email event
    const evt = new SendMailEvent();
    // @ts-ignore minimal shape for mail template
    evt.user = { _id: user._id, email: (u as any)?.email, fullName: (u as any)?.fullName } as any;
    evt.mailType = MailType.TwoFactorAuth;
    evt.code = code;
    this.eventEmitter.emit("send.mail", evt);
    return { sent: true };
  }

  async enableTwoFactor(user: IUser, code: string) {
    const u = await this.userService.findById(user._id, "twoFactorOTP twoFactorOTPExpiry twoFactorEnabled");
    if (!u?.twoFactorOTP || !u?.twoFactorOTPExpiry)
      throw new BadRequestException("No two-factor request found. Please request a code first");
    if (new Date() > u.twoFactorOTPExpiry)
      throw new BadRequestException("Two-factor code has expired");
    if (u.twoFactorOTP !== code)
      throw new BadRequestException("Invalid two-factor code");
    await this.userService.findByIdAndUpdate(user._id, {
      twoFactorEnabled: true,
      $unset: { twoFactorOTP: "", twoFactorOTPExpiry: "" },
    });
    return { enabled: true };
  }

  async disableTwoFactor(user: IUser, code: string) {
    const u = await this.userService.findById(user._id, "twoFactorOTP twoFactorOTPExpiry twoFactorEnabled");
    if (!u?.twoFactorOTP || !u?.twoFactorOTPExpiry)
      throw new BadRequestException("No two-factor request found. Please request a code first");
    if (new Date() > u.twoFactorOTPExpiry)
      throw new BadRequestException("Two-factor code has expired");
    if (u.twoFactorOTP !== code)
      throw new BadRequestException("Invalid two-factor code");
    await this.userService.findByIdAndUpdate(user._id, {
      twoFactorEnabled: false,
      $unset: { twoFactorOTP: "", twoFactorOTPExpiry: "" },
    });
    return { enabled: false };
  }

  // ===================== Ads =====================
  async createAd(myUser: IUser, body: { title: string; imageUrl: string; linkUrl?: string }) {
    if (!body?.title || !body?.imageUrl) {
      throw new BadRequestException("title and imageUrl are required");
    }
    // Enforce paid flow if adSubmissionFee > 0
    try {
      const cfg = await this.appConfigService.getConfig();
      const fee = Number((cfg as any)?.adSubmissionFee ?? 0);
      if (fee > 0) {
        throw new BadRequestException("Ad submission requires payment. Please use /profile/ads/submit/initiate to start payment.");
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      // if config not available, default to allow legacy behavior
    }
    const created = await this.adsService.create({
      userId: myUser._id,
      title: body.title,
      imageUrl: body.imageUrl,
      linkUrl: body.linkUrl,
      status: 'pending',
    });
    return Array.isArray(created) ? created[0] : created;
  }

  async getApprovedAds(limit = 10) {
    return this.adsService.getApprovedActive(limit);
  }

  async initiateAdSubmission(
    myUser: IUser,
    body: { title: string; imageUrl: string; linkUrl?: string; phone: string }
  ) {
    const title = (body?.title || '').toString().trim();
    const imageUrl = (body?.imageUrl || '').toString().trim();
    const linkUrl = (body?.linkUrl || '').toString().trim() || null;
    const phone = (body?.phone || '').toString().trim();
    if (!title || !imageUrl) throw new BadRequestException('title and imageUrl are required');
    if (!phone) throw new BadRequestException('phone is required');

    const cfg = await this.appConfigService.getConfig();
    const fee = Number((cfg as any)?.adSubmissionFee ?? 0);

    if (!fee || fee <= 0) {
      // Free submission -> create ad immediately
      const created = await this.adsService.create({
        userId: myUser._id,
        title,
        imageUrl,
        linkUrl: linkUrl || undefined,
        status: 'pending',
        feeAtSubmission: 0,
      });
      const doc = Array.isArray(created) ? created[0] : created;
      return { free: true, adId: doc?._id?.toString?.() ?? doc?.id ?? null };
    }

    // Create submission doc
    const submission = await this.adSubmissionModel.create({
      userId: myUser._id.toString(),
      title,
      imageUrl,
      linkUrl,
      amountKes: fee,
      currency: 'KES',
      status: 'pending',
    });

    const accountReference = `AD-${submission._id.toString()}`;
    try {
      const res = await this.pesapalService.submitOrder({
        userId: myUser._id.toString(),
        amount: fee,
        currency: 'KES',
        description: 'Ad Submission Fee',
        accountReference,
      });
      await this.adSubmissionModel.findByIdAndUpdate(submission._id, {
        orderTrackingId: res?.orderTrackingId,
        merchantReference: res?.merchantReference,
        accountReference,
      });
      return {
        id: submission._id.toString(),
        orderTrackingId: res?.orderTrackingId,
        redirectUrl: res?.redirectUrl,
        merchantReference: res?.merchantReference,
        amount: fee,
      };
    } catch (e) {
      await this.adSubmissionModel.findByIdAndUpdate(submission._id, { status: 'failed' });
      throw e;
    }
  }

  async getAdSubmissionStatus(myUser: IUser, id: string) {
    if (!id) throw new BadRequestException('id is required');
    const sub: any = await this.adSubmissionModel.findOne({ _id: id, userId: myUser._id.toString() }).lean();
    if (!sub) throw new BadRequestException('submission not found');
    return {
      id: sub._id?.toString?.() ?? sub._id,
      status: sub.status,
      adId: sub.adId || null,
      amount: sub.amountKes,
      mpesaReceiptNumber: sub.mpesaReceiptNumber,
      checkoutRequestId: sub.checkoutRequestId,
      merchantRequestId: sub.merchantRequestId,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    };
  }

  // Wallet-based ad submission (no M-Pesa STK)
  async submitAdWithWallet(
    myUser: IUser,
    body: { title: string; imageUrl: string; linkUrl?: string }
  ) {
    const title = (body?.title || '').toString().trim();
    const imageUrl = (body?.imageUrl || '').toString().trim();
    const linkUrl = (body?.linkUrl || '').toString().trim() || null;
    if (!title || !imageUrl) throw new BadRequestException('title and imageUrl are required');

    const cfg = await this.appConfigService.getConfig();
    const fee = Number((cfg as any)?.adSubmissionFee ?? 0);

    if (!fee || fee <= 0) {
      // Free submission -> create ad immediately
      const created = await this.adsService.create({
        userId: myUser._id,
        title,
        imageUrl,
        linkUrl: linkUrl || undefined,
        status: 'pending',
        feeAtSubmission: 0,
      });
      const doc = Array.isArray(created) ? created[0] : created;
      return { free: true, adId: doc?._id?.toString?.() ?? doc?.id ?? null };
    }

    // Paid submission - deduct from wallet
    const userId = myUser._id.toString();

    // Create submission doc first
    const submission = await this.adSubmissionModel.create({
      userId,
      title,
      imageUrl,
      linkUrl,
      amountKes: fee,
      currency: 'KES',
      status: 'pending',
      accountReference: `AD-WALLET-${Date.now()}`,
    });

    try {
      // Deduct from user balance atomically
      await this.userService.subtractFromBalanceAtomic(userId, fee);
    } catch (e) {
      // Payment failed - update submission status
      await this.adSubmissionModel.findByIdAndUpdate(submission._id, { status: 'failed' });
      throw new BadRequestException(e instanceof BadRequestException ? e.message : 'Insufficient balance');
    }

    // Payment succeeded - create the ad
    const created = await this.adsService.create({
      userId: myUser._id,
      title,
      imageUrl,
      linkUrl: linkUrl || undefined,
      status: 'pending',
      feeAtSubmission: fee,
    });
    const doc = Array.isArray(created) ? created[0] : created;
    const adId = doc?._id?.toString?.() ?? doc?.id ?? null;

    // Update submission as success
    await this.adSubmissionModel.findByIdAndUpdate(submission._id, {
      status: 'success',
      adId,
      mpesaReceiptNumber: 'WALLET',
    });

    return {
      success: true,
      adId,
      amount: fee,
      message: 'Ad submitted successfully using wallet balance',
    };
  }

  async getMyAds(user: IUser, dto: Object) {
    return await this.adsService.getUserAds(
      user._id,
      [dto, { sort: { createdAt: -1 }, select: '-__v' }]
    );
  }

  async getMutualGroups(userId1: string, userId2: string) {
    try {
      console.log(`Finding mutual groups between ${userId1} and ${userId2}`);

      // 1) Find common room ids between the two users using room members
      const commons = await this.roomMemberService.findCommonRooms([
        userId1,
        userId2,
      ]);
      const commonRoomIds = (commons || []).map((c: any) => c._id);
      console.log(`Common room ids: ${commonRoomIds}`);

      if (!commonRoomIds.length) {
        // Fallback using group_member collection directly
        const u1 = new mongoose.Types.ObjectId(userId1);
        const u2 = new mongoose.Types.ObjectId(userId2);
        const user1Groups = await this.groupMember.findAll({ uId: u1 }, 'rId');
        const u1RoomIds = user1Groups.map((g: any) => g.rId);
        if (!u1RoomIds.length) return [];
        const user2Groups = await this.groupMember.findAll(
          { uId: u2, rId: { $in: u1RoomIds } },
          'rId'
        );
        const u2RoomIds = user2Groups.map((g: any) => g.rId);
        if (!u2RoomIds.length) return [];
        commonRoomIds.push(...u2RoomIds);
      }

      // 2) Fetch one member doc per room for metadata (title/image), filter to groups
      const members = await this.roomMemberService.findAll(
        { rId: { $in: commonRoomIds }, rT: RoomType.GroupChat, isD: false },
        'rId t img rT'
      );

      // 3) Deduplicate by room id and map to DTO expected by client
      const seen = new Set<string>();
      const result: Array<{ id: string; title: string; image?: string; description?: string }> = [];
      for (const m of members as any[]) {
        const id = (m.rId && m.rId.toString) ? m.rId.toString() : `${m.rId}`;
        if (seen.has(id)) continue;
        seen.add(id);
        result.push({ id, title: m.t, image: m.img });
      }
      console.log(`Returning mutual groups: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      console.error('Error fetching mutual groups:', error);
      return [];
    }
  }

  // Balance management methods
  async getUserBalance(userId: string) {
    console.log("ProfileService: getUserBalance called with userId:", userId);
    try {
      const balance = await this.userService.getUserBalance(userId);
      console.log("ProfileService: getUserBalance result:", balance);
      return {
        balance: balance,
        formattedBalance: `KSh ${balance.toFixed(2)}`,
      };
    } catch (error) {
      console.error("ProfileService: getUserBalance error:", error);
      throw error;
    }
  }

  // Direct balance method that bypasses all validation
  async getUserBalanceDirect(userId: string) {
    console.log(
      "ProfileService: getUserBalanceDirect called with userId:",
      userId
    );
    try {
      const balance = await this.userService.getUserBalanceDirect(userId);
      console.log("ProfileService: getUserBalanceDirect result:", balance);
      return {
        balance: balance,
        formattedBalance: `KSh ${balance.toFixed(2)}`,
      };
    } catch (error) {
      console.error("ProfileService: getUserBalanceDirect error:", error);
      // Return 0 if any error
      return {
        balance: 0,
        formattedBalance: "KSh 0.00",
      };
    }
  }

  async addToBalance(userId: string, amount: number) {
    const user = await this.userService.addToBalance(userId, amount);
    return {
      balance: user.balance,
      formattedBalance: `KSh ${user.balance.toFixed(2)}`,
    };
  }

  async subtractFromBalance(userId: string, amount: number) {
    const user = await this.userService.subtractFromBalance(userId, amount);
    return {
      balance: user.balance,
      formattedBalance: `KSh ${user.balance.toFixed(2)}`,
    };
  }

  // Claimed gifts management methods
  async claimGift(userId: string, giftMessageId: string, amount: number) {
    // First check if gift is already claimed
    const isAlreadyClaimed = await this.userService.isGiftClaimed(
      userId,
      giftMessageId
    );
    if (isAlreadyClaimed) {
      throw new BadRequestException("Gift has already been claimed");
    }

    // Add gift to claimed list and add amount to balance
    await this.userService.addClaimedGift(userId, giftMessageId);
    const user = await this.userService.addToBalance(userId, amount);

    return {
      success: true,
      balance: user.balance,
      formattedBalance: `KSh ${user.balance.toFixed(2)}`,
      message: `Gift of KSh ${amount.toFixed(2)} claimed successfully!`,
    };
  }

  async isGiftClaimed(userId: string, giftMessageId: string) {
    const isClaimed = await this.userService.isGiftClaimed(
      userId,
      giftMessageId
    );
    return {
      isClaimed: isClaimed,
      giftMessageId: giftMessageId,
    };
  }
}
