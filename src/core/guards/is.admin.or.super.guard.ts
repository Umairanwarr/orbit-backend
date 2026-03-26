/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { BadRequestException, CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "../../api/auth/auth.service";
import { UserRole } from "../../core/utils/enums";
import { AppConfigService } from "../../api/app_config/app_config.service";
import bcrypt from "bcrypt";

@Injectable()
export class IsSuperAdminGuard implements CanActivate {
    constructor(
        readonly config: ConfigService,
        private readonly authService: AuthService,
        private readonly appConfigService: AppConfigService,
    ) {}

    async canActivate(
        context: ExecutionContext,
    ): Promise<boolean> {
        const request = context.switchToHttp().getRequest();

        // 1) Allow Authorization: Bearer <jwt> for admin users
        const authHeader = request.headers["authorization"] || request.headers["Authorization"];
        if (authHeader && authHeader.toString().startsWith("Bearer ")) {
            const token = authHeader.toString().split("Bearer ")[1];
            try {
                const user = await this.authService.getVerifiedUser(token);
                // Ensure roles include Admin
                if (!user?.roles || !Array.isArray(user.roles) || !user.roles.includes(UserRole.Admin)) {
                    throw new BadRequestException("Only admin users can access the admin panel");
                }
                request['isViewer'] = false;
                request.user = user;
                return true;
            } catch (e) {
                // Fall through to legacy admin-key if JWT invalid
            }
        }

        // 2) Fallback to legacy admin-key header with DB-backed password support
        const adminKeyHeader = request.headers["admin-key"];
        if (!adminKeyHeader) {
            throw new BadRequestException("admin-key header is required");
        }
        const userPassword = adminKeyHeader.toString();

        // Viewer password remains env-based
        const passwordViewer = this.config.get<string>("ControlPanelAdminPasswordViewer");

        // Admin password: prefer DB-stored hash from AppConfig; only fall back to env value if no hash exists yet
        let adminPasswordHash: string | undefined;
        try {
            const appConfig = await this.appConfigService.getConfig();
            adminPasswordHash = appConfig?.adminPanelPasswordHash ?? undefined;
        } catch (e) {
            adminPasswordHash = undefined;
        }
        const envAdminPassword = this.config.get<string>("ControlPanelAdminPassword")?.toString();

        // 2.a) Viewer access using viewer password from env
        if (passwordViewer && userPassword === passwordViewer.toString()) {
            request['isViewer'] = true;
            return true;
        }

        // 2.b) Admin access using DB-backed hashed password (if configured)
        if (adminPasswordHash) {
            const ok = await bcrypt.compare(userPassword, adminPasswordHash);
            if (ok) {
                request['isViewer'] = false;
                return true;
            }

            // If a DB hash exists but the password doesn't match, do NOT fall back to env.
            // This ensures that once configured from the admin panel, env password is no longer accepted.
            throw new BadRequestException("admin-key header should be valid for admin panel access");
        }

        // 2.c) Legacy fallback to plain env admin password (only when no DB hash exists yet)
        if (envAdminPassword && userPassword === envAdminPassword) {
            request['isViewer'] = false;
            return true;
        }

        throw new BadRequestException("admin-key header should be valid for admin panel access");
    }
}