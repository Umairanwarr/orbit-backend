/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import LoginDto from "./dto/login.dto";
import RegisterDto from "./dto/register.dto";
import date from "date-and-time";
import bcrypt from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import { UserService } from "../user_modules/user/user.service";
import geoIp from "geoip-lite";
import { remove } from "remove-accents";
import { UserDeviceService } from "../user_modules/user_device/user_device.service";
import { IUser } from "../user_modules/user/entities/user.entity";
import { AppConfigService } from "../app_config/app_config.service";
import { isUUID } from "class-validator";
import { ConfigService } from "@nestjs/config";
import { UserCountryService } from "../user_modules/user_country/user_country.service";
import {
  AccessTokenType,
  MailType,
  Platform,
  PushTopics,
  RegisterMethod,
  RegisterStatus,
  UserRole,
  VPushProvider,
} from "../../core/utils/enums";
import { resOK, i18nApi } from "../../core/utils/res.helpers";
import ResetPasswordDto from "./dto/reset.password.dto";
import LogoutDto from "./dto/logout.dto";
import { newMongoObjId } from "../../core/utils/utils";
import { JwtDecodeRes } from "../../core/utils/interfaceces";
import { FileUploaderService } from "../../common/file_uploader/file_uploader.service";
import { NotificationEmitterService } from "../../common/notification_emitter/notification_emitter.service";
import {
  LoyaltyPointsService,
  LoyaltyPointsAction,
} from "../user_modules/loyalty_points/loyalty_points.service";
import { MailEmitterService } from "../mail/mail.emitter.service";
import { SocialLoginDto } from "./dto/social-login.dto";
import axios from "axios";
import * as crypto from "crypto";

@Injectable()
export class AuthService {
  constructor(
    private readonly uploaderService: FileUploaderService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly appConfigService: AppConfigService,
    private readonly configService: ConfigService,
    private readonly userDevice: UserDeviceService,
    private readonly mailEmitterService: MailEmitterService,
    private readonly userCountryService: UserCountryService,
    private readonly notificationEmitterService: NotificationEmitterService,
    private readonly loyaltyPointsService: LoyaltyPointsService
  ) {}

  async resetPasswordWithLink(
    email: string,
    token: string,
    newPassword: string
  ) {
    const user = await this.userService.findOne(
      { email: email.toLowerCase() },
      "_id email resetPasswordOTP resetPasswordOTPExpiry password"
    );

    if (!user) {
      throw new BadRequestException("User not found");
    }

    if (new Date() > user.resetPasswordOTPExpiry) {
      throw new BadRequestException("Reset link has expired");
    }

    if (
      !user.resetPasswordOTP ||
      !user.resetPasswordOTPExpiry ||
      user.resetPasswordOTP !== token
    ) {
      throw new BadRequestException("Invalid or expired reset link");
    }

    // update password (will trigger pre('findOneAndUpdate') hook to hash)
    await this.userService.findOneAndUpdate(
      { _id: user._id },
      {
        $set: { password: newPassword },
        $unset: { resetPasswordOTP: "", resetPasswordOTPExpiry: "" },
      }
    );

    return "Password reset successfully";
  }

  async sendResetPasswordLink(email: string, isDev: boolean) {
    const usr = await this.userService.findOneByEmailOrThrow(
      email.toLowerCase(),
      "email fullName userImage verifiedAt"
    );

    // generate secure random token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 mins expiry

    // store token & expiry in DB
    await this.userService.findByIdAndUpdate(usr._id, {
      resetPasswordOTP: resetToken,
      resetPasswordOTPExpiry: resetTokenExpiry,
    });

    // build reset link
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}&email=${usr.email}`;

    // send email with link
    await this.mailEmitterService.sendResetPasswordLink(usr, resetLink, isDev);

    return isDev
      ? `Reset link (dev mode): ${resetLink}`
      : "Password reset link has been sent to your email";
  }

  async handleSocialLogin(profile: any, provider: string, dto: SocialLoginDto) {
    let user = await this.userService.findOne({
      $or: [{ socialId: profile.id, provider }, { email: profile.email }],
    });

    if (!user) {
      const password = crypto.randomBytes(16).toString("hex");
      const uniqueCode = await this.generateUniqueCode();
      const appConfig = await this.appConfigService.getConfig();

      user = await this.userService.create({
        email: profile.email,
        fullName: profile.name,
        fullNameEn: remove(profile.name),
        password,
        uniqueCode,
        socialId: profile.id,
        provider,
        registerStatus: appConfig.userRegisterStatus,
        userImage: profile.picture || appConfig.userIcon,
        verifiedAt: new Date(),
        registerMethod: dto.registerMethod,
      });

      await this.loyaltyPointsService.addPoints(
        user._id,
        LoyaltyPointsAction.SIGNUP
      );
    } else {
      // Update user profile picture from social login if available
      try {
        if (profile.picture && profile.picture !== user.userImage) {
          console.log('🔐 Updating user profile picture:', profile.picture);
          await this.userService.findByIdAndUpdate(user._id, {
            userImage: profile.picture,
          });
          user.userImage = profile.picture;
          console.log('🔐 Profile picture updated successfully');
        }
      } catch (e) {
        console.error('🔐 Failed to update profile picture:', e);
      }
    }

    let token = this._signJwt(user._id.toString(), dto.deviceId.toString());
    return {
      success: true,
      token,
      user,
    };
  }

  async auth0Login(dto: SocialLoginDto) {
    const domain = this.configService.get<string>("AUTH0_DOMAIN") || process.env.AUTH0_DOMAIN;
    if (!domain) {
      throw new BadRequestException("AUTH0_DOMAIN is not configured");
    }
    const { accessToken } = dto;
    if (!accessToken) {
      throw new BadRequestException("accessToken is required");
    }
    try {
      const response = await axios.get(`https://${domain}/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const info = response.data || {};
      console.log('🔐 Auth0 user info:', JSON.stringify(info, null, 2));
      const sub: string = info.sub || ""; // e.g., google-oauth2|1234567890
      const [providerKey, rawId] = sub.split("|");
      const id = rawId || info.user_id || info.sid || info.oid;
      const name = info.name || info.nickname || info.given_name || "Orbit User";
      const email = (info.email || (id ? `${id}@${providerKey || "auth0"}.com` : null));
      const picture = info.picture;
      console.log('🔐 Extracted picture URL:', picture);

      let method: RegisterMethod = RegisterMethod.google;
      switch ((providerKey || "").toLowerCase()) {
        case "google-oauth2":
          method = RegisterMethod.google;
          break;
        case "facebook":
          method = RegisterMethod.facebook;
          break;
        case "twitter":
        case "twitter-oauth-2":
          method = RegisterMethod.twitter;
          break;
        case "linkedin":
        case "linkedin-openid":
          method = RegisterMethod.linkedin as any;
          break;
        case "windowslive":
        case "microsoft":
        case "microsoft-account":
          method = RegisterMethod.microsoft as any;
          break;
        case "yahoo":
          method = RegisterMethod.yahoo as any;
          break;
        case "snapchat":
          method = RegisterMethod.snapchat as any;
          break;
        default:
          method = RegisterMethod.google;
      }

      dto.registerMethod = method;

      const profile = {
        id: id,
        name: name,
        email: (email || `${id}@${(providerKey || "auth0")}.com`).toLowerCase(),
        picture: picture,
      } as any;

      const res = await this.handleSocialLogin(profile, method, dto);

      // Create/replace device and sign access token like normal login
      const access = await this.deleteDevicesAndCreateNew({
        userId: res.user._id,
        session: null,
        language: dto.language,
        platform: dto.platform as any,
        ip: dto.ip,
        deviceInfo: dto.deviceInfo as any,
        pushKey: dto.pushKey,
        userDeviceId: dto.deviceId,
      });

      await this._pushNotificationSubscribe(dto.pushKey, dto.platform as any);

      return {
        accessToken: access,
        status: res.user.registerStatus,
      };
    } catch (error) {
      throw new UnauthorizedException("Invalid Auth0 token");
    }
  }

  async googleLogin(dto: SocialLoginDto) {
    const { accessToken } = dto;
    try {
      const response = await axios.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      return this.handleSocialLogin(response.data, RegisterMethod.google, dto);
    } catch (error) {
      throw new UnauthorizedException("Invalid Google token");
    }
  }

  async facebookLogin(dto: SocialLoginDto) {
    const { accessToken } = dto;
    try {
      const response = await axios.get(
        `https://graph.facebook.com/me?fields=id,name,email&access_token=${accessToken}`
      );
      return this.handleSocialLogin(
        response.data,
        RegisterMethod.facebook,
        dto
      );
    } catch (error) {
      throw new UnauthorizedException("Invalid Facebook token");
    }
  }

  async twitterLogin(dto: SocialLoginDto) {
    const { accessToken } = dto;
    try {
      const response = await axios.get(
        "https://api.twitter.com/2/users/me?user.fields=id,name,profile_image_url",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const profile = response.data.data;
      return this.handleSocialLogin(
        {
          id: profile.id,
          name: profile.name,
          email: `${profile.id}@twitter.com`, // Twitter doesn't provide email
        },
        RegisterMethod.twitter,
        dto
      );
    } catch (error) {
      throw new UnauthorizedException("Invalid Twitter token");
    }
  }

  async sendOtpAdminReset(email: string, isDev: boolean) {
    const admin = await this.userService.findOne(
      {
        email: email.toLowerCase(),
        roles: { $in: [UserRole.Admin, UserRole.Prime] },
      },
      "_id email roles"
    );

    if (!admin) {
      throw new BadRequestException("This email does not belong to an admin");
    }

    // Generate OTP
    const code = await this.mailEmitterService.sendConfirmEmail(
      // @ts-ignore: sendConfirmEmail expects IUser-like shape
      admin,
      MailType.ResetPassword,
      isDev
    );

    // Save OTP and expiry in DB
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    await this.userService.findOneAndUpdate(
      { _id: admin._id },
      {
        $set: {
          resetPasswordOTP: code.toString(),
          resetPasswordOTPExpiry: expiry,
        },
      }
    );

    return isDev
      ? `Admin reset OTP sent: ${code}`
      : "Admin password reset OTP sent to email";
  }

  async verifyOtpAdminReset(email: string, otp: string, newPassword: string) {
    const admin = await this.userService.findOne(
      { email: email.toLowerCase() },
      "_id email resetPasswordOTP resetPasswordOTPExpiry roles"
    );

    if (!admin) {
      throw new BadRequestException("Admin not found");
    }

    if (!admin.resetPasswordOTP || !admin.resetPasswordOTPExpiry) {
      throw new BadRequestException("No OTP request found for this email");
    }

    if (admin.resetPasswordOTP !== otp) {
      throw new BadRequestException("Invalid OTP");
    }

    if (new Date() > admin.resetPasswordOTPExpiry) {
      throw new BadRequestException("OTP has expired");
    }

    // This triggers your pre('findOneAndUpdate') hook to hash the password
    await this.userService.findOneAndUpdate(
      { _id: admin._id },
      {
        $set: { password: newPassword },
        $unset: { resetPasswordOTP: "", resetPasswordOTPExpiry: "" },
      },
      undefined, // no session
      { new: true }
    );

    return "Password reset successfully";
  }

  async comparePassword(dtoPassword, dbHasPassword) {
    let bcryptRes = await bcrypt.compare(dtoPassword, dbHasPassword);
    if (!bcryptRes) {
      throw new BadRequestException(i18nApi.invalidLoginDataString);
    }
    return true;
  }

  async login(dto: LoginDto, isDev: boolean) {
    let foundedUser: IUser = await this.userService.findOneByEmailOrThrow(
      dto.email,
      "+password userDevice lastMail banTo email registerStatus deletedAt"
    );
    await this.comparePassword(dto.password, foundedUser.password);
    if (foundedUser.banTo) {
      throw new BadRequestException(i18nApi.yourAccountBlockedString);
    }
    // if (foundedUser.deletedAt) {
    //     await this.userService.findByIdAndUpdate(foundedUser._id, {
    //         deletedAt: null
    //     })
    // }

    let countryData = await geoIp.lookup(dto.ip);
    let countryId;
    if (countryData) {
      countryId = await this.userCountryService.setUserCountry(
        foundedUser._id,
        countryData.country
      );
    }
    await this.userService.findByIdAndUpdate(foundedUser._id, {
      address: countryData,
      countryId: countryId,
    });

    let oldDevice = await this.userDevice.findOne({
      uId: foundedUser._id,
      userDeviceId: dto.deviceId,
    });
    if (oldDevice) {
      await this.userDevice.findByIdAndUpdate(oldDevice._id, {
        pushProvider: this._getVPushProvider(dto.pushKey),
        pushKey: dto.pushKey,
      });
      let access = this._signJwt(
        foundedUser._id.toString(),
        oldDevice._id.toString()
      );
      return resOK({
        accessToken: access,
        status: foundedUser.registerStatus,
      });
    }
    // this is new device
    let mongoDeviceId = newMongoObjId().toString();
    let access = this._signJwt(foundedUser._id.toString(), mongoDeviceId);
    await this.userDevice.create({
      _id: mongoDeviceId,
      userDeviceId: dto.deviceId,
      uId: foundedUser._id,
      language: dto.language,
      platform: dto.platform,
      pushProvider: this._getVPushProvider(dto.pushKey),
      dIp: dto.ip,
      deviceInfo: dto.deviceInfo,
      pushKey: dto.pushKey,
    });
    await this._pushNotificationSubscribe(dto.pushKey, dto.platform);
    return resOK({
      accessToken: access,
      status: foundedUser.registerStatus,
    });
  }

  async register(dto: RegisterDto) {
    let countryData = await geoIp.lookup(dto.ip);
    let foundedUser: IUser = await this.userService.findOneByEmail(
      dto.email,
      "email"
    );
    if (foundedUser) {
      throw new BadRequestException(i18nApi.userAlreadyRegisterString);
    }

    // Check if email is verified via OTP
    if (!global.tempOtpStorage) {
      global.tempOtpStorage = new Map();
    }

    const otpData = global.tempOtpStorage.get(dto.email.toLowerCase());
    if (!otpData || !otpData.verified) {
      throw new BadRequestException(
        "Email must be verified before registration"
      );
    }
    const uniqueCode = await this.generateUniqueCode();
    let appConfig = await this.appConfigService.getConfig();

    let createdUser: IUser = await this.userService.create({
      email: dto.email,
      fullName: dto.fullName,
      registerStatus: appConfig.userRegisterStatus,
      bio: null,
      uniqueCode: uniqueCode,
      fullNameEn: remove(dto.fullName),
      registerMethod: dto.method,
      address: countryData,
      password: dto.password,
      lastSeenAt: new Date(),
      // @ts-ignore
      lastMail: {},
      userImage: appConfig.userIcon,
    });
    if (countryData) {
      let countryId = await this.userCountryService.setUserCountry(
        createdUser._id,
        countryData.country
      );
      await this.userService.findByIdAndUpdate(createdUser._id, {
        countryId,
      });
    }
    let accessToken = await this.deleteDevicesAndCreateNew({
      userId: createdUser._id,
      session: null,
      language: dto.language,
      platform: dto.platform,
      ip: dto.ip,
      deviceInfo: dto.deviceInfo,
      pushKey: dto.pushKey,
      userDeviceId: dto.deviceId,
    });
    if (dto.imageBuffer) {
      let res = await this.uploaderService.putImageCropped(
        dto.imageBuffer,
        createdUser._id
      );
      await this.userService.findByIdAndUpdate(createdUser._id, {
        userImage: res,
      });
    }

    // Add loyalty points for signup
    try {
      await this.loyaltyPointsService.addPoints(
        createdUser._id,
        LoyaltyPointsAction.SIGNUP
      );
    } catch (error) {
      console.error("Failed to add signup loyalty points:", error);
    }

    let config = await this.appConfigService.getConfig();
    await this._pushNotificationSubscribe(dto.pushKey, dto.platform);

    // Clean up temporary OTP data
    if (global.tempOtpStorage) {
      global.tempOtpStorage.delete(dto.email.toLowerCase());
    }

    return {
      accessToken: accessToken,
      status: config.userRegisterStatus,
    };
  }

  async sendOtpResetPassword(email: string, isDev: boolean) {
    let usr = await this.userService.findOneByEmailOrThrow(
      email.toLowerCase(),
      "email fullName userImages verifiedAt lastMail"
    );
    let code = await this.mailEmitterService.sendConfirmEmail(
      usr,
      MailType.ResetPassword,
      isDev
    );
    await this.userService.findByIdAndUpdate(usr._id, {
      lastMail: {
        type: MailType.ResetPassword,
        sendAt: new Date(),
        code: code,
        expired: false,
      },
    });
    if (isDev) {
      return "Password reset code has been send to your email " + code;
    }
    return "Password reset code has been send to your email";
  }

  async sendOtpRegister(email: string, isDev: boolean) {
    // Check if user already exists
    let existingUser = await this.userService.findOneByEmail(
      email.toLowerCase(),
      "email"
    );
    if (existingUser) {
      throw new BadRequestException(i18nApi.userAlreadyRegisterString);
    }

    // Create a temporary user record for OTP verification
    let tempUser = {
      email: email.toLowerCase(),
      fullName: "New User", // This will be updated during actual registration
      _id: null,
      lastMail: null,
    };

    let code = await this.mailEmitterService.sendConfirmEmail(
      tempUser as any,
      MailType.VerifyEmail,
      isDev
    );

    // Store OTP in a temporary collection or cache
    // For now, we'll use a simple in-memory storage (in production, use Redis or database)
    if (!global.tempOtpStorage) {
      global.tempOtpStorage = new Map();
    }

    global.tempOtpStorage.set(email.toLowerCase(), {
      code: code.toString(),
      sendAt: new Date(),
      expired: false,
    });

    if (isDev) {
      return "Registration OTP has been sent to your email " + code;
    }
    return "Registration OTP has been sent to your email";
  }

  async verifyOtpRegister(email: string, code: string) {
    if (!global.tempOtpStorage) {
      global.tempOtpStorage = new Map();
    }

    const otpData = global.tempOtpStorage.get(email.toLowerCase());
    if (!otpData) {
      throw new BadRequestException(
        i18nApi.noCodeHasBeenSendToYouToVerifyYourEmailString
      );
    }

    let appConfig = await this.appConfigService.getConfig();
    let min = parseInt(
      date.subtract(new Date(), otpData.sendAt).toMinutes().toString(),
      10
    );
    if (otpData.expired || min > appConfig.maxExpireEmailTime) {
      throw new BadRequestException(i18nApi.codeHasBeenExpiredString);
    }

    if (otpData.code !== code) {
      throw new BadRequestException("Invalid code!");
    }

    // Mark as verified
    global.tempOtpStorage.set(email.toLowerCase(), {
      ...otpData,
      expired: true,
      verified: true,
    });

    return "Email verified successfully";
  }

  async verifyOtpResetPassword(dto: ResetPasswordDto) {
    let user = await this.userService.findOneByEmailOrThrow(
      dto.email,
      "lastMail"
    );
    if (!user.lastMail || !user.lastMail.code) {
      throw new BadRequestException(
        i18nApi.noCodeHasBeenSendToYouToVerifyYourEmailString
      );
    }
    let appConfig = await this.appConfigService.getConfig();
    let min = parseInt(
      date.subtract(new Date(), user.lastMail.sendAt).toMinutes().toString(),
      10
    );
    if (user.lastMail.expired || min > appConfig.maxExpireEmailTime) {
      throw new BadRequestException(i18nApi.codeHasBeenExpiredString);
    }
    if (user.lastMail.type != MailType.ResetPassword) {
      throw new BadRequestException("Cant process with the mail type");
    }
    if (user.lastMail.code == dto.code) {
      await this.userService.findByIdAndUpdate(user._id, {
        "lastMail.expired": true,
        password: dto.newPassword,
      });
      return "Password has been reset successfully";
    } else {
      throw new BadRequestException(i18nApi.invalidCodeString);
    }
  }

  async getVerifiedUser(accessToken: string) {
    let jwtDecodeRes = this._jwtVerify(accessToken);
    console.log(
      "AuthService: getVerifiedUser called with userId:",
      jwtDecodeRes.userId,
      "type:",
      typeof jwtDecodeRes.userId
    );

    // Use direct MongoDB query to bypass validation for authentication
    let user: IUser = await this.userService.findByIdForAuth(
      jwtDecodeRes.userId,
      "fullName fullNameEn verifiedAt userImage userType banTo deletedAt registerStatus"
    );
    if (!user) throw new ForbiddenException(i18nApi.whileAuthCanFindYouString);
    user._id = user._id.toString();
    this.userLoginValidate(user);
    let device = await this.userDevice.findById(
      jwtDecodeRes.deviceId,
      "_id platform"
    );
    if (!device)
      throw new HttpException(
        i18nApi.userDeviceSessionEndDeviceDeletedString,
        450
      );
    user.currentDevice = device;
    return user;
  }

  async logOut(dto: LogoutDto) {
    if (dto.logoutFromAll == true) {
      let foundedUser: IUser = await this.userService.findById(
        dto.myUser._id,
        "+password userDevice verifiedAt lastMail banTo email registerStatus"
      );
      let bcryptRes = await bcrypt.compare(dto.password, foundedUser.password);
      if (!bcryptRes) {
        throw new BadRequestException(i18nApi.invalidLoginDataString);
      }
      await this.userDevice.deleteMany({
        uId: dto.myUser._id,
      });
      return i18nApi.deviceHasBeenLogoutFromAllDevicesString;
    }

    await this.userDevice.findByIdAndDelete(dto.myUser.currentDevice._id);
    return "Device has been logout";
  }

  private async sendMailToUser(
    user: IUser,
    mailType: MailType,
    isDev: boolean,
    session?
  ) {}

  async generateUniqueCode(): Promise<number> {
    let uniqueCode: number;
    let isUnique = false;

    while (!isUnique) {
      uniqueCode = Math.floor(100000 + Math.random() * 900000);

      let existingUser: IUser = await this.userService.findOne(
        {
          uniqueCode: uniqueCode,
        },
        "uniqueCode"
      );

      if (!existingUser) {
        isUnique = true;
      }
    }

    return uniqueCode;
  }

  private userLoginValidate(user: IUser) {
    // if (!user.verifiedAt) throw new BadRequestException('User not verified yet please verify first')
    if (user.banTo)
      throw new HttpException(i18nApi.yourAccountBlockedString, 450);
    if (user.deletedAt)
      throw new HttpException(i18nApi.yourAccountDeletedString, 450);
    // if (user.registerStatus != RegisterStatus.accepted) throw new HttpException(i18nApi.userRegisterStatusNotAcceptedYetString, 450);
  }

  private _signJwt(userId: string, deviceId: string) {
    return this.jwtService.sign({
      id: userId.toString(),
      deviceId: deviceId.toString(),
      accessType: AccessTokenType.Access,
    });
  }

  private async deleteDevicesAndCreateNew(dto: {
    userId: string;
    session?;
    pushKey?: string;
    userDeviceId: string;
    ip: string;
    deviceInfo: {};
    language: string;
    platform: Platform;
  }) {
    await this.userDevice.deleteMany({
      uId: dto.userId,
    });
    let mongoDeviceId = newMongoObjId().toString();
    let access = this._signJwt(dto.userId, mongoDeviceId);
    await this.userDevice.create(
      {
        _id: mongoDeviceId,
        uId: dto.userId,
        dIp: dto.ip,
        pushProvider: this._getVPushProvider(dto.pushKey),
        pushKey: dto.pushKey,
        userDeviceId: dto.userDeviceId,
        lastSeenAt: new Date(),
        deviceInfo: dto.deviceInfo,
        language: dto.language,
        platform: dto.platform,
      },
      dto.session
    );
    return access;
  }

  private _jwtVerify(token: string): JwtDecodeRes {
    try {
      let payload = this.jwtService.verify(token);
      return {
        deviceId: payload["deviceId"],
        userId: payload["id"],
      };
    } catch (err) {
      throw new BadRequestException("Jwt access token not valid " + token);
    }
  }

  private _getVPushProvider(pushKey?: string) {
    if (!pushKey) return null;
    let isOneSignal = isUUID(pushKey.toString());
    return isOneSignal ? VPushProvider.onesignal : VPushProvider.fcm;
  }

  private async _pushNotificationSubscribe(
    pushKey: string,
    platform: Platform
  ) {
    if (!pushKey) {
      return;
    }
    if (this._getVPushProvider(pushKey) == VPushProvider.fcm) {
      if (platform == Platform.Android) {
        await this.notificationEmitterService.subscribeFcmTopic(
          pushKey,
          PushTopics.AdminAndroid
        );
      }
      if (platform == Platform.Ios) {
        await this.notificationEmitterService.subscribeFcmTopic(
          pushKey,
          PushTopics.AdminIos
        );
      }
    } else {
      if (platform == Platform.Android) {
        await this.notificationEmitterService.subscribeOnesignalTopic(
          pushKey,
          PushTopics.AdminAndroid
        );
      }
      if (platform == Platform.Ios) {
        await this.notificationEmitterService.subscribeOnesignalTopic(
          pushKey,
          PushTopics.AdminIos
        );
      }
    }
  }

  ///this the register
  // async sendRegisterOtp(
  //     dto: RegisterDto,
  //     isDev: boolean,
  //     session?: mongoose.ClientSession,
  // ) {
  //   let countryData = await geoIp.lookup(dto.ip)
  //   let res = {};
  //   res['message'] = 'Verification code has been send to your email';
  //   let foundedUser: IUser = await this.userService.findOneByEmail(
  //       dto.email,
  //       'email lastMail verifiedAt',
  //   );
  //   // already register and verified
  //   if (foundedUser && foundedUser.verifiedAt) {
  //     throw new BadRequestException('User already in data base and verified');
  //   }
  //   // already register but not verified yet
  //   if (foundedUser && !foundedUser.verifiedAt) {
  //     let code = await this.sendMailToUser(foundedUser, MailType.VerifyEmail, isDev, session);
  //     if (isDev) {
  //       res['code'] = code
  //     }
  //     res['accessToken'] = await this.deleteDevicesAndCreateNew({
  //       userId: foundedUser._id,
  //       session: session,
  //       lang: dto.lang,
  //       platform: dto.platform,
  //       ip: dto.ip,
  //       mapInfo: JSON.parse(dto.mapInfo),
  //       pushKey: dto.pushKey,
  //       userDeviceId: dto.deviceId
  //     })
  //     return res;
  //   }
  //
  //   //not registered yet
  //   let createdUser: IUser = await this.userService.create({
  //     email: dto.email,
  //     fullName: dto.fullName,
  //     fullNameEn: remove(dto.fullName),
  //     address: countryData,
  //     lastSeenAt: new Date(),
  //     password: dto.password,
  //     // @ts-ignore
  //     lastMail: {},
  //     userImage:defaultUserBigImage,
  //   }, session);
  //   let code = await this.sendMailToUser(createdUser, MailType.VerifyEmail, isDev, session);
  //   if (isDev) {
  //     res['code'] = code
  //   }
  //   res['accessToken'] = await this.deleteDevicesAndCreateNew({
  //     userId: createdUser._id,
  //     session: session,
  //     lang: dto.lang,
  //     platform: dto.platform,
  //     ip: dto.ip,
  //     mapInfo: JSON.parse(dto.mapInfo),
  //     pushKey: dto.pushKey,
  //     userDeviceId: dto.deviceId
  //   })
  //   if (dto.imageBuffer) {
  //     let res = await this.s3.putImageCropped(dto.imageBuffer, createdUser._id);
  //     await this.userService.findByIdAndUpdate(createdUser._id, {
  //       userImage: res,
  //     }, session);
  //   }
  //   return res;
  // }

  // async validateEmail(dto: ValidateEmailDto) {
  //   let foundedUser: IUser = await this.userService.findOneByEmailOrThrow(dto.email, "fullName email lastMail verifiedAt")
  //   if (foundedUser.verifiedAt) {
  //     throw new BadRequestException('User already verified');
  //   }
  //   if (!foundedUser.lastMail || !foundedUser.lastMail.code) {
  //     throw new BadRequestException(
  //         'No code has been send to you to verify your email',
  //     );
  //   }
  //   let min = parseInt(
  //       date
  //           .subtract(new Date(), foundedUser.lastMail.sendAt)
  //           .toMinutes()
  //           .toString(),
  //       10,
  //   );
  //   if (foundedUser.lastMail.expired || min > appConfig.maxExpireEmailTime) {
  //     throw new BadRequestException('Code has been expired');
  //   }
  //   if (foundedUser.lastMail.type != MailType.VerifyEmail) {
  //     throw new BadRequestException('You must use code from VerifyEmail Type');
  //   }
  //   if (foundedUser.lastMail.code == dto.code) {
  //     await this.userService.findByIdAndUpdate(foundedUser._id, {
  //       verifiedAt: new Date(),
  //       'lastMail.expired': true,
  //     });
  //     return "Email has been verified successfully"
  //   }
  //   throw new BadRequestException('Invalid code !');
  // }
}
