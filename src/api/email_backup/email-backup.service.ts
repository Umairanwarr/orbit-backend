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
import { IRoomMember } from "../../chat/room_member/entities/room_member.entity";
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
    @InjectModel("room_member")
    private readonly roomMemberModel: Model<IRoomMember>,
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
      const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
      const categories = (settings.categories || []) as BackupCategory[];
      const dateStr = new Date().toISOString().slice(0, 10);

      // ── CHATS: WhatsApp-style per-conversation .txt files ──────────
      if (categories.includes("chats")) {
        const chatFiles = await this._buildChatTextFiles(userId);
        attachments.push(...chatFiles);
      }

      // ── CONTACTS: readable list ────────────────────────────────────
      if (categories.includes("contacts")) {
        const contactsTxt = await this._buildContactsFile(userId);
        if (contactsTxt) attachments.push(contactsTxt);
      }

      // NOTE: Media messages (images, videos, voice, files) are already
      // included inline within each per-chat .txt file with proper
      // indicators and attachment URLs — no separate file needed.

      if (attachments.length === 0) {
        attachments.push({
          filename: `orbit-backup-${dateStr}-empty.txt`,
          content: Buffer.from("No data found to back up.", "utf8"),
          contentType: "text/plain",
        });
      }

      const to = [settings.primaryEmail, settings.secondaryEmail]
        .filter(Boolean)
        .join(", ");
      const subject = `Orbit Chat Backup (${reason}) - ${dateStr}`;

      const totalSize = attachments.reduce((s, a) => s + a.content.length, 0);

      const summaryLines = [
        `Orbit Chat Backup — ${dateStr}`,
        ``,
        `Total files: ${attachments.length}`,
        `Total size: ${(totalSize / 1024).toFixed(1)} KB`,
        `Categories: ${categories.join(", ")}`,
        ``,
        `Files:`,
        ...attachments.map((a) => `  • ${a.filename} (${(a.content.length / 1024).toFixed(1)} KB)`),
        ``,
        `This backup was generated automatically by Orbit.`,
      ];
      const textBody = summaryLines.join("\n");

      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #B48648;">📦 Orbit Chat Backup</h2>
          <p style="color: #666;">${dateStr} &bull; ${reason} backup</p>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p><strong>Total files:</strong> ${attachments.length}</p>
          <p><strong>Total size:</strong> ${(totalSize / 1024).toFixed(1)} KB</p>
          <p><strong>Categories:</strong> ${categories.join(", ")}</p>
          <h3>Attached files:</h3>
          <ul>
            ${attachments.map((a) => `<li>${a.filename} <span style="color:#999;">(${(a.content.length / 1024).toFixed(1)} KB)</span></li>`).join("\n")}
          </ul>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p style="color: #999; font-size: 12px;">This backup was generated automatically by Orbit. Each chat is exported as a readable text file.</p>
        </div>
      `;

      await this.mailer.sendMail({
        to,
        subject,
        text: textBody,
        html: htmlBody,
        attachments,
      } as any);

      const finishedAt = new Date();
      await this.historyModel.findByIdAndUpdate(hist._id, {
        $set: {
          status: "success",
          failureReason: null,
          sizeBytes: totalSize,
          parts: attachments.length,
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

      return { ok: true, parts: attachments.length, sizeBytes: totalSize };
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

    const jsonBuf = require("zlib").gunzipSync(gz);
    const obj = JSON.parse(jsonBuf.toString("utf8"));

    // NOTE: Full DB restore is app-specific and potentially destructive.
    // For now we validate and return the parsed backup payload so the client can proceed safely.
    return { ok: true, backup: obj };
  }

  // ── WhatsApp-style chat export ──────────────────────────────────────

  private async _buildChatTextFiles(userId: string): Promise<Array<{ filename: string; content: Buffer; contentType: string }>> {
    // 1. Get all rooms the user is a member of
    const memberships = await this.roomMemberModel
      .find({ uId: userId, isD: false } as any)
      .lean();

    if (!memberships.length) return [];

    const roomIds = memberships.map((m) => m.rId);
    const roomMap = new Map<string, IRoomMember>();
    for (const m of memberships) {
      roomMap.set(m.rId.toString(), m);
    }

    // 2. Fetch ALL messages for these rooms (both sent and received)
    const allMessages = await this.messageModel
      .find({
        rId: { $in: roomIds },
        dltAt: null, // not deleted
      } as any)
      .sort({ _id: 1 } as any) // chronological order
      .limit(50000) // safety cap
      .lean();

    // 3. Group messages by room
    const messagesByRoom = new Map<string, any[]>();
    for (const msg of allMessages) {
      const rid = msg.rId.toString();
      if (!messagesByRoom.has(rid)) messagesByRoom.set(rid, []);
      messagesByRoom.get(rid)!.push(msg);
    }

    // 4. Generate a .txt file per room
    const files: Array<{ filename: string; content: Buffer; contentType: string }> = [];

    for (const [roomId, messages] of messagesByRoom.entries()) {
      const membership = roomMap.get(roomId);
      const roomTitle = membership?.t || membership?.tEn || `Chat ${roomId.slice(-6)}`;
      const roomType = membership?.rT || "s";

      const lines: string[] = [];
      const sanitizedTitle = roomTitle.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "Chat";

      // Header
      const roomTypeLabel = roomType === "g" ? "Group" : roomType === "b" ? "Broadcast" : "Chat";
      lines.push(`═══════════════════════════════════════════════`);
      lines.push(`  Orbit ${roomTypeLabel} Backup: ${roomTitle}`);
      lines.push(`  Messages: ${messages.length}`);
      if (messages.length > 0) {
        const first = this._parseDate(messages[0].createdAt);
        const last = this._parseDate(messages[messages.length - 1].createdAt);
        lines.push(`  Period: ${first} → ${last}`);
      }
      lines.push(`═══════════════════════════════════════════════`);
      lines.push("");

      // Messages
      for (const msg of messages) {
        const dt = this._parseDate(msg.createdAt);
        const sender = msg.sName || "Unknown";
        const msgType = msg.mT || "text";

        // Skip info/system messages or format them differently
        if (msgType === "info") {
          lines.push(`[${dt}] ℹ️ ${msg.c || "System message"}`);
          continue;
        }

        if (msgType === "call") {
          lines.push(`[${dt}] 📞 ${sender}: ${msg.c || "Call"}`);
          continue;
        }

        // Deleted messages
        if (msg.dltAt) {
          lines.push(`[${dt}] ${sender}: 🚫 This message was deleted`);
          continue;
        }

        // Build content line
        let content = msg.c || "";
        const attachment = msg.msgAtt as any;

        // Add media indicator based on type
        switch (msgType) {
          case "image":
            content = `📷 Image${content ? ` — ${content}` : ""}`;
            if (attachment?.url) content += ` [${attachment.url}]`;
            break;
          case "video":
            content = `🎥 Video${content ? ` — ${content}` : ""}`;
            if (attachment?.url) content += ` [${attachment.url}]`;
            break;
          case "voice": {
            const dur = attachment?.duration ? ` (${attachment.duration}s)` : "";
            content = `🎤 Voice message${dur}`;
            if (attachment?.url) content += ` [${attachment.url}]`;
            break;
          }
          case "file": {
            const fname = attachment?.name || "file";
            content = `📎 File: ${fname}`;
            if (attachment?.url) content += ` [${attachment.url}]`;
            break;
          }
          case "location":
            content = `📍 Location${content ? `: ${content}` : ""}`;
            break;
          default:
            // plain text – keep as is
            break;
        }

        // Reply indicator
        if (msg.rTo) {
          const repliedTo = (msg.rTo as any).sName || "someone";
          lines.push(`[${dt}] ${sender} (replying to ${repliedTo}):`);
        } else {
          lines.push(`[${dt}] ${sender}:`);
        }

        // Multi-line message content – indent continuation lines
        const contentLines = content.split("\n");
        for (const cl of contentLines) {
          lines.push(`    ${cl}`);
        }

        // Reactions
        if (msg.reactions && typeof msg.reactions === "object") {
          const reactionParts: string[] = [];
          for (const [emoji, users] of Object.entries(msg.reactions)) {
            const count = Array.isArray(users) ? users.length : 1;
            reactionParts.push(`${emoji} ${count}`);
          }
          if (reactionParts.length) {
            lines.push(`    [Reactions: ${reactionParts.join(" ")}]`);
          }
        }
      }

      lines.push("");
      lines.push(`— End of backup for "${roomTitle}" —`);
      lines.push("");

      const filename = `${sanitizedTitle.substring(0, 50)}.txt`;
      files.push({
        filename,
        content: Buffer.from(lines.join("\n"), "utf8"),
        contentType: "text/plain; charset=utf-8",
      });
    }

    return files;
  }

  private async _buildContactsFile(userId: string): Promise<{ filename: string; content: Buffer; contentType: string } | null> {
    const follows = await this.followModel
      .find({ followerId: userId } as any)
      .sort({ _id: -1 } as any)
      .limit(20000)
      .populate("followingId", "fullName email phoneNumber")
      .lean();

    if (!follows.length) return null;

    const lines: string[] = [
      `═══════════════════════════════════════════════`,
      `  Orbit Contacts Backup`,
      `  Total: ${follows.length} contacts`,
      `  Date: ${new Date().toISOString().slice(0, 10)}`,
      `═══════════════════════════════════════════════`,
      "",
    ];

    for (let i = 0; i < follows.length; i++) {
      const f = follows[i] as any;
      const user = f.followingId;
      if (user && typeof user === "object") {
        lines.push(`${i + 1}. ${user.fullName || "Unknown"}`);
        if (user.email) lines.push(`   Email: ${user.email}`);
        if (user.phoneNumber) lines.push(`   Phone: ${user.phoneNumber}`);
      } else {
        lines.push(`${i + 1}. User ID: ${f.followingId}`);
      }
    }

    lines.push("");
    lines.push(`— End of contacts backup —`);

    return {
      filename: "Contacts.txt",
      content: Buffer.from(lines.join("\n"), "utf8"),
      contentType: "text/plain; charset=utf-8",
    };
  }

  private async _buildMediaFile(userId: string, includeUrls: boolean): Promise<{ filename: string; content: Buffer; contentType: string } | null> {
    const mediaMsgs = await this.messageModel
      .find({ rId: { $in: await this._getUserRoomIds(userId) }, msgAtt: { $ne: null } } as any)
      .sort({ _id: -1 } as any)
      .limit(10000)
      .lean();

    if (!mediaMsgs.length) return null;

    const lines: string[] = [
      `═══════════════════════════════════════════════`,
      `  Orbit Media Backup`,
      `  Total media messages: ${mediaMsgs.length}`,
      `  Date: ${new Date().toISOString().slice(0, 10)}`,
      `═══════════════════════════════════════════════`,
      "",
    ];

    for (const msg of mediaMsgs) {
      const dt = this._parseDate(msg.createdAt);
      const sender = (msg as any).sName || "Unknown";
      const att = msg.msgAtt as any;
      const type = msg.mT || "file";
      const typeIcon = type === "image" ? "📷" : type === "video" ? "🎥" : type === "voice" ? "🎤" : "📎";

      let line = `[${dt}] ${typeIcon} ${sender} — ${type}`;
      if (att?.name) line += ` "${att.name}"`;
      if (att?.fileSize) line += ` (${(att.fileSize / 1024).toFixed(1)} KB)`;
      if (includeUrls && att?.url) line += `\n    URL: ${att.url}`;
      lines.push(line);
    }

    lines.push("");
    lines.push(`— End of media backup —`);

    return {
      filename: "Media.txt",
      content: Buffer.from(lines.join("\n"), "utf8"),
      contentType: "text/plain; charset=utf-8",
    };
  }

  // ── helpers ─────────────────────────────────────────────────────────

  private async _getUserRoomIds(userId: string): Promise<string[]> {
    const memberships = await this.roomMemberModel
      .find({ uId: userId, isD: false } as any)
      .select("rId")
      .lean();
    return memberships.map((m) => m.rId.toString());
  }

  private _parseDate(d: any): string {
    try {
      const dt = new Date(d);
      const pad = (n: number) => n < 10 ? `0${n}` : `${n}`;
      return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
    } catch {
      return String(d);
    }
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
