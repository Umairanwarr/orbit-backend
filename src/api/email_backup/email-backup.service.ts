import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ConfigService } from "@nestjs/config";
import { Model } from "mongoose";
import { MailerService } from "@nestjs-modules/mailer";
import zlib from "zlib";

import {
  BackupCategory,
  BackupFrequency,
  EmailBackupSettings,
  EmailBackupSettingsDocument,
} from "./schemas/email-backup-settings.schema";
import {
  EmailBackupHistory,
  EmailBackupHistoryDocument,
} from "./schemas/email-backup-history.schema";
import { encryptBuffer, decryptBuffer } from "./email-backup.crypto";
import { UpdateEmailBackupSettingsDto } from "./dto/update-email-backup-settings.dto";

import { IMessage } from "../../chat/message/entities/message.entity";
import { IUserFollow } from "../user_modules/user_follow/entities/user_follow.entity";

@Injectable()
export class EmailBackupService {
  private readonly logger = new Logger(EmailBackupService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    @InjectModel(EmailBackupSettings.name)
    private readonly settingsModel: Model<EmailBackupSettingsDocument>,
    @InjectModel(EmailBackupHistory.name)
    private readonly historyModel: Model<EmailBackupHistoryDocument>,
    @InjectModel("message")
    private readonly messageModel: Model<IMessage>,
    @InjectModel("user_follow")
    private readonly followModel: Model<IUserFollow>,
  ) {}

  async getSettings(userId: string) {
    return this.settingsModel.findOne({ userId }).lean();
  }

  async upsertSettings(userId: string, dto: UpdateEmailBackupSettingsDto) {
    const nextRunAt = this._computeNextRun(new Date(), dto.frequency);
    const encryptionSecretEnc = dto.encryptionSecret
      ? this._protectSecret(dto.encryptionSecret)
      : undefined;

    const updated = await this.settingsModel
      .findOneAndUpdate(
        { userId },
        {
          $set: {
            primaryEmail: dto.primaryEmail,
            secondaryEmail: dto.secondaryEmail || null,
            frequency: dto.frequency,
            includeAttachments: !!dto.includeAttachments,
            encrypted: !!dto.encrypted,
            encryptionSecretEnc: dto.encrypted ? encryptionSecretEnc : null,
            sizeLimitMb: dto.sizeLimitMb,
            categories: dto.categories as BackupCategory[],
            nextRunAt,
          },
        },
        { upsert: true, new: true },
      )
      .lean();

    return updated;
  }

  async listHistory(userId: string, limit = 20) {
    return this.historyModel
      .find({ userId })
      .sort({ createdAt: -1 } as any)
      .limit(Math.min(Math.max(limit, 1), 100))
      .lean();
  }

  async runBackupNow(userId: string, reason: "manual" | "scheduled" = "manual") {
    const settings = await this.settingsModel.findOne({ userId }).lean();
    if (!settings) {
      throw new BadRequestException("Email backup settings not configured");
    }
    if (!settings.primaryEmail) {
      throw new BadRequestException("Primary backup email is required");
    }

    const startedAt = new Date();
    const hist = await this.historyModel.create({
      userId,
      status: "failed",
      startedAt,
      primaryEmail: settings.primaryEmail,
      secondaryEmail: settings.secondaryEmail,
      frequency: settings.frequency,
      categories: settings.categories,
      includeAttachments: settings.includeAttachments,
      encrypted: settings.encrypted,
      parts: 0,
      failureReason: "pending",
    } as any);

    try {
      const payloadObj = await this._buildBackupPayload(userId, settings);
      const json = Buffer.from(JSON.stringify(payloadObj), "utf8");
      const gz = zlib.gzipSync(json);

      let blob = gz;
      let meta: any = { encoding: "gzip+json" };
      if (settings.encrypted) {
        const secret = this._resolveEncryptionSecret(settings);
        if (!secret) {
          throw new BadRequestException(
            "Encryption is enabled but encryption secret is missing",
          );
        }
        const enc = encryptBuffer(gz, secret);
        blob = enc.payload;
        meta = { encoding: "enc+a256gcm+gzip+json", enc: enc.meta };
      }

      const maxBytes = (Number(settings.sizeLimitMb || 100) || 100) * 1024 * 1024;
      const parts = this._split(blob, maxBytes);

      const to = [settings.primaryEmail, settings.secondaryEmail]
        .filter(Boolean)
        .join(", ");
      const subject = `Orbit Backup (${reason}) - ${new Date().toISOString().slice(0, 10)}`;
      const baseName = `orbit-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;

      const attachments = parts.map((buf, idx) => ({
        filename:
          parts.length === 1
            ? `${baseName}.bin`
            : `${baseName}.part${idx + 1}.bin`,
        content: buf,
        contentType: "application/octet-stream",
      }));

      // Send a small meta JSON alongside (not encrypted) to allow restore parsing
      attachments.push({
        filename: `${baseName}.meta.json`,
        content: Buffer.from(JSON.stringify(meta, null, 2), "utf8"),
        contentType: "application/json",
      });

      await this.mailer.sendMail({
        to,
        subject,
        text:
          "Your Orbit backup is attached.\n\n" +
          "Files:\n" +
          attachments.map((a) => `- ${a.filename}`).join("\n"),
        attachments,
      });

      const finishedAt = new Date();
      await this.historyModel.findByIdAndUpdate(hist._id, {
        $set: {
          status: "success",
          failureReason: null,
          sizeBytes: blob.length,
          parts: parts.length,
          finishedAt,
        },
      });

      await this.settingsModel.findOneAndUpdate(
        { userId },
        {
          $set: {
            lastRunAt: finishedAt,
            nextRunAt: this._computeNextRun(finishedAt, settings.frequency),
          },
        },
      );

      return { ok: true, parts: parts.length, sizeBytes: blob.length };
    } catch (e: any) {
      const finishedAt = new Date();
      await this.historyModel.findByIdAndUpdate(hist._id, {
        $set: {
          status: "failed",
          failureReason: e?.message || "Backup failed",
          finishedAt,
        },
      });
      this.logger.error(`Backup failed: ${e?.message}`);
      throw e instanceof BadRequestException
        ? e
        : new InternalServerErrorException("Backup failed");
    }
  }

  async restoreFromUploadedBackup(params: {
    userId: string;
    blob: Buffer;
    meta: any;
    encryptionSecret?: string;
  }) {
    const meta = params.meta || {};
    const encoding = meta.encoding || "gzip+json";
    let gz: Buffer;

    if (encoding.startsWith("enc+")) {
      const secret = params.encryptionSecret;
      if (!secret) {
        throw new BadRequestException("encryptionSecret is required for restore");
      }
      gz = decryptBuffer(params.blob, secret, meta.enc);
    } else {
      gz = params.blob;
    }

    const jsonBuf = zlib.gunzipSync(gz);
    const obj = JSON.parse(jsonBuf.toString("utf8"));

    // NOTE: Full DB restore is app-specific and potentially destructive.
    // For now we validate and return the parsed backup payload so the client can proceed safely.
    return { ok: true, backup: obj };
  }

  private async _buildBackupPayload(userId: string, settings: EmailBackupSettings) {
    const categories = (settings.categories || []) as BackupCategory[];
    const includeAttachments = !!settings.includeAttachments;

    const payload: any = {
      version: 1,
      createdAt: new Date().toISOString(),
      userId,
      categories,
      includeAttachments,
      data: {},
    };

    if (categories.includes("chats")) {
      // Minimal: messages sent by user (plus room id), safest without room_member joins
      const msgs = await this.messageModel
        .find({ sId: userId } as any)
        .sort({ _id: -1 } as any)
        .limit(5000)
        .lean();
      payload.data.chats = { messages: msgs };
    }

    if (categories.includes("contacts")) {
      const follows = await this.followModel
        .find({ followerId: userId } as any)
        .sort({ _id: -1 } as any)
        .limit(20000)
        .lean();
      payload.data.contacts = { following: follows };
    }

    if (categories.includes("media")) {
      // Media is stored as msgAtt on messages; include URLs only unless includeAttachments=false
      const mediaMsgs = await this.messageModel
        .find({ sId: userId, msgAtt: { $ne: null } } as any)
        .sort({ _id: -1 } as any)
        .limit(5000)
        .lean();
      payload.data.media = includeAttachments
        ? { messageAttachments: mediaMsgs.map((m: any) => ({ _id: m._id, rId: m.rId, mT: m.mT, msgAtt: m.msgAtt })) }
        : { messageAttachments: mediaMsgs.map((m: any) => ({ _id: m._id, rId: m.rId, mT: m.mT })) };
    }

    return payload;
  }

  private _split(buf: Buffer, maxBytes: number): Buffer[] {
    if (!maxBytes || buf.length <= maxBytes) return [buf];
    const parts: Buffer[] = [];
    for (let i = 0; i < buf.length; i += maxBytes) {
      parts.push(buf.subarray(i, Math.min(i + maxBytes, buf.length)));
    }
    return parts;
  }

  private _computeNextRun(from: Date, frequency: BackupFrequency): Date {
    const d = new Date(from.getTime());
    if (frequency === "daily") d.setDate(d.getDate() + 1);
    else if (frequency === "weekly") d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    return d;
  }

  private _protectSecret(secret: string): string {
    const serverKey =
      this.config.get<string>("JWT_SECRET") ?? process.env.JWT_SECRET ?? "orbit";
    const enc = encryptBuffer(Buffer.from(secret, "utf8"), serverKey);
    return JSON.stringify({ payload: enc.payload.toString("base64"), meta: enc.meta });
  }

  private _unprotectSecret(encJson: string): string | null {
    try {
      const parsed = JSON.parse(encJson);
      const serverKey =
        this.config.get<string>("JWT_SECRET") ?? process.env.JWT_SECRET ?? "orbit";
      const buf = Buffer.from(parsed.payload, "base64");
      const plain = decryptBuffer(buf, serverKey, parsed.meta);
      return plain.toString("utf8");
    } catch {
      return null;
    }
  }

  private _resolveEncryptionSecret(settings: EmailBackupSettings): string | null {
    if (!settings.encryptionSecretEnc) return null;
    return this._unprotectSecret(settings.encryptionSecretEnc);
  }
}

