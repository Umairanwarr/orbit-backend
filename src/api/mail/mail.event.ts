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
                this.mailerService.sendMail({
                    to: event.user.email,
                    subject: "Reset your Orbit Chat password",
                    template: "./password_reset",
                    context: {
                        name: event.user.fullName,
                        code: event.code,
                        appName: appConfig.appName,
                    },
                    text: `Hi ${event.user.fullName},\n\nReset your Orbit Chat password using this link (valid for 15 minutes):\n${event.code}\n\nIf you did not request a password reset, you can ignore this email.`,
                    headers: sgHeaders,
                }).then(value => {
                });
            } else if (event.mailType == MailType.VerifyEmail) {
                // If event.code holds a URL (link-based verification), send it as 'link'
                const isLink = typeof event.code === 'string' && event.code.startsWith('http');
                let appLink: string | undefined = undefined;
                if (isLink) {
                    try {
                        const u = new URL(event.code);
                        const t = u.searchParams.get('token') || '';
                        const em = u.searchParams.get('email') || event.user.email || '';
                        appLink = `com.orbit.ke://verify?email=${encodeURIComponent(em)}&token=${encodeURIComponent(t)}&verified=1`;
                    } catch (e) {}
                }
                await this.mailerService.sendMail({
                    to: event.user.email,
                    subject: "Verify your email for Orbit Chat",
                    template: "./email_verification",
                    context: isLink ? {
                        name: event.user.fullName,
                        link: event.code,
                        webLink: event.code,
                        appLink: appLink,
                        appName: appConfig.appName,
                    } : {
                        name: event.user.fullName,
                        code: event.code,
                        appName: appConfig.appName,
                    },
                    text: isLink
                        ? `Hi ${event.user.fullName},\n\nVerify your Orbit Chat email by opening this link (valid for 15 minutes):\n${event.code}`
                        : `Hi ${event.user.fullName},\n\nYour Orbit Chat verification code is: ${event.code}. This code will expire in 15 minutes.`,
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