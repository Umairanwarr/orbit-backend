/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {Injectable, Logger} from "@nestjs/common";
import {OnEvent} from "@nestjs/event-emitter";
import {MailerService} from "@nestjs-modules/mailer";
import {SendMailEvent} from "../../core/utils/interfaceces";
import {MailType} from "../../core/utils/enums";
import {AppConfigService} from "../app_config/app_config.service";

@Injectable()
export class MailEvent {
    private readonly logger = new Logger(MailEvent.name);

    constructor(
        private mailerService: MailerService,
        private appConfig: AppConfigService,
    ) {
    }


    @OnEvent("send.mail")
    async handleOrderCreatedEvent(event: SendMailEvent) {
        let appConfig = await this.appConfig.getConfig();
        try {
            const category = event.mailType == MailType.VerifyEmail
                ? ["transactional", "verify-email"]
                : event.mailType == MailType.ResetPassword
                    ? ["transactional", "password-reset"]
                    : event.mailType == MailType.TwoFactorAuth
                        ? ["transactional", "two-factor"]
                        : ["transactional", "code"];
            const sgHeaders = {
                'X-SMTPAPI': JSON.stringify({
                    category,
                    filters: {
                        clicktrack: { settings: { enable: 0 } },
                        opentrack: { settings: { enable: 0 } }
                    }
                })
            } as any;
            if (event.mailType == MailType.ResetPassword) {
                await this.mailerService.sendMail({
                    to: event.user.email,
                    subject: "Reset your Orbit Chat password",
                    template: "./password_reset",
                    context: {
                        name: event.user.fullName,
                        code: event.code,
                        appName: appConfig.appName,
                    },
                    text: `Hi ${event.user.fullName},\n\nYour Orbit Chat password reset code is: ${event.code}. It expires in 15 minutes.\n\nIf you did not request a password reset, you can ignore this email.`,
                    headers: sgHeaders,
                });
            } else if (event.mailType == MailType.VerifyEmail) {
                await this.mailerService.sendMail({
                    to: event.user.email,
                    subject: "Verify your email for Orbit Chat",
                    template: "./email_verification",
                    context: {
                        name: event.user.fullName,
                        code: event.code,
                        appName: appConfig.appName,
                    },
                    text: `Hi ${event.user.fullName},\n\nYour Orbit Chat verification code is: ${event.code}. This code will expire in 15 minutes.`,
                    headers: sgHeaders,
                }).then(value => {
                });
            } else {
                await this.mailerService.sendMail({
                    to: event.user.email,
                    subject: "Your Orbit Chat code",
                    template: "./confirmation",
                    context: {
                        name: event.user.fullName,
                        code: event.code,
                        appName: appConfig.appName
                    },
                    text: `Hi ${event.user.fullName},\n\nYour Orbit Chat code is: ${event.code}.`,
                    headers: sgHeaders,
                }).then(value => {
                });
            }

        } catch (e) {
            this.logger.error(`Failed to send email to ${event.user.email}:`, e);
            console.error('Email send error:', e);
        }
    }
}