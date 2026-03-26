import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly client: any | null;
  private readonly from: string | null;
  private readonly messagingServiceSid: string | null;

  constructor(private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>("TWILIO_ACCOUNT_SID")?.trim();
    const authToken = this.configService.get<string>("TWILIO_AUTH_TOKEN")?.trim();
    this.from = this.configService.get<string>("TWILIO_FROM")?.trim() || null;
    this.messagingServiceSid =
      this.configService.get<string>("TWILIO_MESSAGING_SERVICE_SID")?.trim() ||
      null;

    if (accountSid && authToken) {
      try {
        const twilioFactory = require('twilio');
        this.client = twilioFactory(accountSid, authToken);
      } catch (e) {
        this.client = null;
      }
    } else {
      this.client = null;
    }
  }

  get isReady() {
    return !!this.client && (!!this.messagingServiceSid || !!this.from);
  }

  async sendSms(to: string, body: string) {
    if (!this.client) {
      throw new Error("Twilio is not configured");
    }
    if (!this.messagingServiceSid && !this.from) {
      throw new Error("Twilio sender is not configured");
    }

    const payload: any = {
      to,
      body,
    };

    if (this.messagingServiceSid) {
      payload.messagingServiceSid = this.messagingServiceSid;
    } else {
      payload.from = this.from;
    }

    try {
      return await this.client.messages.create(payload);
    } catch (e: any) {
      this.logger.error(
        `Failed to send SMS to ${to}: ${e?.message || e?.toString?.()}`,
      );
      throw e;
    }
  }
}
