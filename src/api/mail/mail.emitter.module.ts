/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {Module} from '@nestjs/common';
import {MailEmitterService} from './mail.emitter.service';
import {MailerModule} from "@nestjs-modules/mailer";
import {ConfigModule, ConfigService} from "@nestjs/config";
import {HandlebarsAdapter} from "@nestjs-modules/mailer/dist/adapters/handlebars.adapter";
import {join} from 'path';
import {MailEvent} from "./mail.event";
import {AppConfigService} from "../app_config/app_config.service";
import {AppConfigModule} from "../app_config/app_config.module";
import root from "app-root-path";
import { existsSync } from "fs";

@Module({
    providers: [MailEmitterService, MailEvent],
    imports: [
        MailerModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: async (config: ConfigService) => {
                // Provide first-class support for SendGrid via SMTP
                const sendgridKey = config.get<string>('SENDGRID_API_KEY');
                const providerRaw = (config.get<string>('EMAIL_PROVIDER') ?? '').toLowerCase().trim();
                const provider =
                    providerRaw === 'sendgrid' || providerRaw === 'sg'
                        ? 'sendgrid'
                        : providerRaw === 'smtp' ||
                            providerRaw === 'namecheap' ||
                            providerRaw === 'privateemail' ||
                            providerRaw === 'custom'
                          ? 'smtp'
                          : !!sendgridKey || (config.get<string>('EMAIL_HOST') ?? '').includes('sendgrid')
                            ? 'sendgrid'
                            : 'smtp';
                const isSendGrid = provider === 'sendgrid';

                // Host/port/secure
                const host = isSendGrid ? 'smtp.sendgrid.net' : config.getOrThrow<string>("EMAIL_HOST");
                // Default to 587 (TLS/STARTTLS). DigitalOcean blocks 25; 587 is typically allowed.
                const port = parseInt(config.get<string>("EMAIL_PORT") ?? '587', 10);
                const secure = (config.get<string>("EMAIL_SECURE") ?? '').toLowerCase() === 'true' || port === 465;
                const candidates = [
                    join(__dirname, "templates"),
                    join(process.cwd(), "src", "api", "mail", "templates"),
                ];
                const templatesDir = candidates.find(p => existsSync(p)) ?? candidates[0];
                // Resolve auth depending on provider
                const auth = isSendGrid
                    ? {
                        user: 'apikey',
                        pass: sendgridKey || config.getOrThrow<string>('EMAIL_PASSWORD'),
                      }
                    : {
                        user: config.getOrThrow('EMAIL_USER'),
                        pass: config.getOrThrow('EMAIL_PASSWORD'),
                      };

                const fromEmail = config.get<string>('EMAIL_FROM')
                    || config.get<string>('EMAIL_USER')
                    || 'no-reply@localhost';
                const replyToEmail = config.get<string>('EMAIL_REPLY_TO')
                    || config.get<string>('EMAIL_TO')
                    || fromEmail;

                return ({
                    transport: {
                        host,
                        port,
                        secure, // true for 465, false for other ports (STARTTLS)
                        connectionTimeout: parseInt(config.get<string>("EMAIL_CONNECTION_TIMEOUT") ?? '10000', 10),
                        greetingTimeout: parseInt(config.get<string>("EMAIL_GREETING_TIMEOUT") ?? '10000', 10),
                        socketTimeout: parseInt(config.get<string>("EMAIL_SOCKET_TIMEOUT") ?? '10000', 10),
                        logger: (config.get<string>("EMAIL_DEBUG") ?? '').toLowerCase() === 'true',
                        debug: (config.get<string>("EMAIL_DEBUG") ?? '').toLowerCase() === 'true',
                        auth,
                        tls: {
                            rejectUnauthorized: false
                        }
                    },
                    defaults: {
                        from: `\"Orbit Chat\" <${fromEmail}>`,
                        replyTo: replyToEmail
                    },
                    template: {
                        dir: templatesDir,
                        adapter: new HandlebarsAdapter(),
                        options: {
                            strict: true
                        }
                    }
                });
            },

        }),
        AppConfigModule
    ],
    exports: [MailEmitterService],
})
export class MailEmitterModule {
}
