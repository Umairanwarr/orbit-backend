/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import RegisterDto from "./dto/register.dto";
import LoginDto from "./dto/login.dto";
import { IpAddress } from "../../core/custom.decorator/request.ip";
import { IsDevelopment } from "../../core/custom.decorator/decorators";
import { jsonDecoder } from "../../core/utils/app.validator";
import { imageFileInterceptor } from "../../core/utils/upload_interceptors";
import { resOK } from "../../core/utils/res.helpers";
import LogoutDto from "./dto/logout.dto";
import { VerifiedAuthGuard } from "../../core/guards/verified.auth.guard";
import ResetPasswordDto from "./dto/reset.password.dto";
import VerifyEmailDto from "./dto/verify.email.dto";
import { V1Controller } from "../../core/common/v1-controller.decorator";
import { SocialLoginDto } from "./dto/social-login.dto";
import { RegisterMethod } from "src/core/utils/enums";
import { RefreshTokenDto } from "./dto/refresh_token.dto";
import { TwoFactorCodeDto } from "./dto/two_factor_digit.dto";
import { TwoFactorLoginDto } from "./dto/two_factor_login.dto";

@V1Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  // @Get("/requests")
  // async list(@Query() q: AdminListQueryDto) {
  //   const status = q.status ?? VerificationStatus.PENDING;
  //   return resOK(await this.verificationService.listForAdmin(status));
  // }

  // @Patch("/:id/approve")
  // async approve(
  //   @Req() req: any,
  //   @Param() p: VerificationIdParamDto,
  //   @Body() body: AdminDecisionDto
  // ) {
  //   return resOK(await this.verificationService.approve(p.id, req.user, body));
  // }

  // @Patch("/:id/reject")
  // async reject(
  //   @Req() req: any,
  //   @Param() p: VerificationIdParamDto,
  //   @Body() body: AdminDecisionDto
  // ) {
  //   return resOK(await this.verificationService.reject(p.id, req.user, body));
  // }

  @Post("/reset-password-with-link")
  async resetPasswordWithLink(
    @Body("email") email: string,
    @Body("token") token: string,
    @Body("newPassword") newPassword: string
  ) {
    if (!email || !token || !newPassword) {
      throw new BadRequestException(
        "Email, token, and new password are required"
      );
    }
    return resOK(
      await this.authService.resetPasswordWithLink(email, token, newPassword)
    );
  }

  @Post("/send-link-reset-password")
  async sendLinkResetPassword(
    @Body("email") email: string,
    @IsDevelopment() isDev: boolean
  ) {
    if (!email) {
      throw new BadRequestException("Email is required");
    }
    return resOK(await this.authService.sendResetPasswordLink(email, isDev));
  }

  @Post("/google")
  @HttpCode(200)
  async googleLogin(
    @Body() dto: SocialLoginDto,
    @IpAddress() ipAddress: any,
    @IsDevelopment() isDev: boolean
  ) {
    dto.ip = ipAddress;
    dto.registerMethod = RegisterMethod.google;
    return this.authService.googleLogin(dto);
  }

  @Post("/facebook")
  @HttpCode(200)
  async facebookLogin(
    @Body() dto: SocialLoginDto,
    @IpAddress() ipAddress: any,
    @IsDevelopment() isDev: boolean
  ) {
    dto.ip = ipAddress;
    dto.registerMethod = RegisterMethod.facebook;
    return this.authService.facebookLogin(dto);
  }

  @Post("/twitter")
  @HttpCode(200)
  async twitterLogin(
    @Body() dto: SocialLoginDto,
    @IpAddress() ipAddress: any,
    @IsDevelopment() isDev: boolean
  ) {
    dto.ip = ipAddress;
    dto.registerMethod = RegisterMethod.twitter;
    return this.authService.twitterLogin(dto);
  }

  // New endpoints

  @Post("/linkedin")
  @HttpCode(200)
  async linkedinLogin(
    @Body() dto: SocialLoginDto,
    @IpAddress() ipAddress: any
  ) {
    dto.ip = ipAddress;
    dto.registerMethod = RegisterMethod.linkedin;
    return this.authService.linkedinLogin(dto);
  }

  @Post("/microsoft")
  @HttpCode(200)
  async microsoftLogin(
    @Body() dto: SocialLoginDto,
    @IpAddress() ipAddress: any
  ) {
    dto.ip = ipAddress;
    dto.registerMethod = RegisterMethod.microsoft;
    return this.authService.microsoftLogin(dto);
  }

  @Post("/reddit")
  @HttpCode(200)
  async redditLogin(
    @Body() dto: SocialLoginDto,
    @IpAddress() ipAddress: any
  ) {
    dto.ip = ipAddress;
    dto.registerMethod = RegisterMethod.reddit;
    return this.authService.redditLogin(dto);
  }

  @Post("/instagram")
  @HttpCode(200)
  async instagramLogin(
    @Body() dto: SocialLoginDto,
    @IpAddress() ipAddress: any
  ) {
    dto.ip = ipAddress;
    dto.registerMethod = RegisterMethod.instagram;
    return this.authService.instagramLogin(dto);
  }

  @Post('/auth0')
  @HttpCode(200)
  async auth0Login(
    @Body() dto: SocialLoginDto,
    @IpAddress() ipAddress: any
  ) {
    dto.ip = ipAddress;
    return this.authService.auth0Login(dto);
  }

  @Post("/send-otp-admin-reset")
  async sendOtpAdminReset(
    @Body("email") email: string,
    @IsDevelopment() isDev: boolean
  ) {
    if (!email) throw new BadRequestException("Email is required");
    return resOK(await this.authService.sendOtpAdminReset(email, isDev));
  }

  @Post("/verify-otp-admin-reset")
  @HttpCode(200)
  async verifyOtpAdminReset(
    @Body("email") email: string,
    @Body("otp") otp: string,
    @Body("newPassword") newPassword: string
  ) {
    if (!email || !otp || !newPassword) {
      throw new BadRequestException("Email, OTP and newPassword are required");
    }
    return resOK(
      await this.authService.verifyOtpAdminReset(email, otp, newPassword)
    );
  }
  // generate two factor authentication secret and qr code
  @UseGuards(VerifiedAuthGuard)
  @Get("/2fa/generate")
  async generateTwoFactorAuthenticationSecret(@Req() req: any) {
    const user = req.user;
    return resOK(await this.authService.generateTwoFactorSecret(user));
  }

  // enable two factor authentication
  @UseGuards(VerifiedAuthGuard)
  @Post("/2fa/turn-on")
  async turnOnTwoFactorAuthentication(@Req() req: any, @Body() body: TwoFactorCodeDto) {
    const user = req.user;
    return resOK(await this.authService.turnOnTwoFactorAuth(user, body));
  }

  // turn off two factor authentication
  @UseGuards(VerifiedAuthGuard)
  @Post("/2fa/turn-off")
  async turnOffTwoFactorAuthentication(@Req() req: any) {
    const user = req.user;
    return resOK(await this.authService.turnOffTwoFactorAuth(user));
  }

  @UseGuards(VerifiedAuthGuard)
  @Post("/2fa/authenticate")
  async authenticateTwoFactorAuthentication(@Req() req: any, @Body() body: TwoFactorLoginDto) {
    const user = req.user;
    return this.authService.authenticateTwoFactor(user._id, body);
  }


  @Post("/login")
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @IpAddress() ipAddress: any,
    @IsDevelopment() isDev: boolean
  ) {
    dto.ip = ipAddress;
    try {
      dto.deviceInfo = jsonDecoder(dto.deviceInfo);
    } catch (err) {
      //
    }
    return this.authService.login(dto, isDev);
  }

  @Post("/register")
  @UseInterceptors(imageFileInterceptor)
  async registerUser(
    @Req() req: any,
    @Body() dto: RegisterDto,
    @IpAddress() ipAddress: any,
    @UploadedFile() file?: any
  ) {
    if (file) {
      dto.imageBuffer = file.buffer;
    }
    try {
      dto.deviceInfo = jsonDecoder(dto.deviceInfo);
    } catch (err) {
      //
    }
    dto.ip = ipAddress;
    return resOK(await this.authService.register(dto));
  }

  @Post('/refresh')
  async refreshAccessToken(@Body() dto: RefreshTokenDto) {
    return resOK(await this.authService.refreshAccessToken(dto));
  }

  // @Post("/send-otp-register")
  // @UseInterceptors(imageFileInterceptor)
  // async sendRegisterOtp(
  //     @Req() req:any,
  //     @Body() dto: RegisterDto,
  //     @IpAddress() ipAddress,
  //     @IsDevelopment() isDevelopment: boolean,
  //     @UploadedFile() file?: any
  // ) {
  //     if (file) {
  //         dto.imageBuffer = file.buffer;
  //     }
  //     dto.ip = ipAddress;
  //     return resOK(await this.authService.sendRegisterOtp(dto, isDevelopment, null),);
  // }

  // @Post("/validate-email")
  // @HttpCode(200)
  // async validateEmail(@Body() dto: ValidateEmailDto) {
  //     return resOK(await this.authService.validateEmail(dto));
  // }

  @Post("/send-otp-register")
  async sendOtpRegister(
    @Body("email") email: string,
    @IsDevelopment() isDev: boolean
  ) {
    if (!email) {
      throw new BadRequestException("Email is required");
    }
    return resOK(await this.authService.sendOtpRegister(email, isDev));
  }

  @Post('/send-link-register')
  async sendLinkRegister(
    @Body('email') email: string,
    @Body('fullName') fullName: string,
    @Body('password') password: string,
    @Body('profession') profession: string,
    @Body('method') method: RegisterMethod,
    @IsDevelopment() isDev: boolean,
  ) {
    if (!email || !fullName || !password) {
      throw new BadRequestException('Email/phone, full name, and password are required');
    }
    return resOK(
      await this.authService.sendLinkRegister(email, isDev, {
        fullName,
        password,
        profession,
        method,
      }),
    );
  }

  @Post('/verify-link-register')
  @HttpCode(200)
  async verifyLinkRegister(
    @Body('email') email: string,
    @Body('token') token: string,
  ) {
    if (!email || !token) {
      throw new BadRequestException('Email/phone and token are required');
    }
    return resOK(await this.authService.verifyLinkRegister(email, token));
  }

  @Post("/verify-otp-register")
  @HttpCode(200)
  async verifyOtpRegister(@Body() dto: VerifyEmailDto) {
    return resOK(await this.authService.verifyOtpRegister(dto.email, dto.code));
  }

  @Post("/send-otp-reset-password")
  async sendOtpResetPassword(
    @Body("email") email: string,
    @IsDevelopment() isDv: boolean
  ) {
    if (!email) {
      throw new BadRequestException("Email is required");
    }
    // Changed to use link-based reset instead of OTP
    return resOK(await this.authService.sendResetPasswordLink(email, isDv));
  }

  @UseGuards(VerifiedAuthGuard)
  @Post("/logout")
  async logOut(@Body() dto: LogoutDto, @Req() req: any) {
    dto.myUser = req.user;
    return resOK(await this.authService.logOut(dto));
  }

  @Post("/verify-and-reset-password")
  async verifyOtpResetPassword(
    @Body("email") email: string,
    @Body("token") token: string,
    @Body("newPassword") newPassword: string
  ) {
    if (!email || !token || !newPassword) {
      throw new BadRequestException("Email, token, and new password are required");
    }
    // Changed to use link-based reset instead of OTP
    return resOK(await this.authService.resetPasswordWithLink(email, token, newPassword));
  }
}