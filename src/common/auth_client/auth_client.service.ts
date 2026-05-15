import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { ApiCode } from "../../core/utils/res.helpers";
import { IUser } from "../../api/user_modules/user/entities/user.entity";

@Injectable()
export class AuthClientService {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService
  ) {}

  async getVerifiedUser(accessToken: string): Promise<IUser> {
    const base = this.config
      .get<string>("AUTH_SERVICE_BASE_URL", "")
      .replace(/\/+$/, "");
    if (!base) {
      throw new ServiceUnavailableException(
        "AUTH_SERVICE_BASE_URL is not configured"
      );
    }

    const internalKey = this.config.get<string>("INTERNAL_SERVICES_API_KEY");
    const url = `${base}/api/v1/internal/auth/verify`;

    try {
      const { data } = await firstValueFrom(
        this.http.post(
          url,
          {},
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              ...(internalKey ? { "X-Internal-Api-Key": internalKey } : {}),
            },
            timeout: 15000,
          }
        )
      );

      if (data?.code !== ApiCode.SUCCESS) {
        throw new BadRequestException(data?.data ?? "Auth verify failed");
      }

      const user = data?.data?.user as IUser;
      if (!user) {
        throw new BadRequestException("Auth verify returned no user");
      }

      return user;
    } catch (e: any) {
      const status = e?.response?.status;
      const body = e?.response?.data;
      if (status === 400 || status === 401 || status === 403) {
        throw new BadRequestException(
          body?.message ?? body?.data ?? "Invalid or expired token"
        );
      }

      throw new ServiceUnavailableException(
        "Auth service unreachable: " + (e?.message ?? "unknown error")
      );
    }
  }
}
