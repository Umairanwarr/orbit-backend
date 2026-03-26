import { BadRequestException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { MpesaTransaction, MpesaTransactionDocument } from "./schemas/mpesa-transaction.schema";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { RecordingPurchase } from "../../live_stream/schemas/recording_purchase.schema";
import { UserService } from "../../user_modules/user/user.service";
import { AdsService } from "../../ads/ads.service";

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);

  private get baseUrl() {
    const env = this.config.get<string>("MPESA_ENV") || process.env.MPESA_ENV || "sandbox";
    const explicit = this.config.get<string>("MPESA_BASE_URL") || process.env.MPESA_BASE_URL;
    if (explicit) return explicit;
    return env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  }

  constructor(
    private readonly config: ConfigService,
    @InjectModel(MpesaTransaction.name)
    private readonly txModel: Model<MpesaTransactionDocument>,
    @InjectModel(RecordingPurchase.name)
    private readonly purchaseModel: Model<RecordingPurchase>,
    @InjectModel('GiftPurchase')
    private readonly giftPurchaseModel: Model<any>,
    @InjectModel('SupportDonation')
    private readonly supportDonationModel: Model<any>,
    @InjectModel('MusicSupport')
    private readonly musicSupportModel: Model<any>,
    @InjectModel('ArticleSupport')
    private readonly articleSupportModel: Model<any>,
    @InjectModel('AdSubmission')
    private readonly adSubmissionModel: Model<any>,
    private readonly eventEmitter: EventEmitter2,
    private readonly userService: UserService,
    private readonly adsService: AdsService,
  ) {}

  private async getAccessToken(): Promise<string> {
    const key = this.config.get<string>("MPESA_CONSUMER_KEY") || process.env.MPESA_CONSUMER_KEY;
    const secret = this.config.get<string>("MPESA_CONSUMER_SECRET") || process.env.MPESA_CONSUMER_SECRET;
    if (!key || !secret) throw new BadRequestException("M-Pesa consumer key/secret not configured");
    const basic = Buffer.from(`${key}:${secret}`).toString("base64");
    const url = `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`;
    // Debug: log which environment/base URL we are using (no secrets)
    try {
      const env = this.config.get<string>("MPESA_ENV") || process.env.MPESA_ENV || "sandbox";
      this.logger.warn(`M-Pesa OAuth: requesting token from ${url} (env=${env})`);
    } catch {}
    try {
      const { data } = await axios.get(url, {
        headers: { Authorization: `Basic ${basic}` },
        timeout: 30000, // Increased from 10s to 30s for Safaricom API
      });
      return data.access_token;
    } catch (e: any) {
      this.logger.error(`Failed to get M-Pesa access token: ${e?.response?.data ? JSON.stringify(e.response.data) : e.message}`);
      throw new InternalServerErrorException("Failed to get M-Pesa access token");
    }
  }

  // ===== Wallet Withdrawal (B2C using user wallet balance) =====
  async withdrawFromWallet(dto: { userId: string; amount: number; phone?: string; remarks?: string; occasion?: string }) {
    if (!dto?.userId) throw new BadRequestException("Missing userId");
    const amount = Math.floor(Number(dto?.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException("amount must be > 0");

    const shortCode = this.config.get<string>("MPESA_SHORTCODE") || process.env.MPESA_SHORTCODE;
    const initiator = this.config.get<string>("MPESA_INITIATOR_NAME") || process.env.MPESA_INITIATOR_NAME;
    const securityCredential = this.config.get<string>("MPESA_SECURITY_CREDENTIAL") || process.env.MPESA_SECURITY_CREDENTIAL;
    const resultUrl = this.config.get<string>("MPESA_B2C_RESULT_URL") || process.env.MPESA_B2C_RESULT_URL;
    const timeoutUrl = this.config.get<string>("MPESA_B2C_TIMEOUT_URL") || process.env.MPESA_B2C_TIMEOUT_URL;
    const commandId = this.config.get<string>("MPESA_B2C_COMMAND_ID") || process.env.MPESA_B2C_COMMAND_ID || "BusinessPayment";
    if (!shortCode || !initiator || !securityCredential || !resultUrl || !timeoutUrl) {
      throw new BadRequestException("Missing B2C configuration (shortcode, initiator, security credential, result/timeout URLs)");
    }

    let phone = (dto?.phone || "").toString().trim();
    if (!phone) {
      try {
        const u = await this.userService.findById(dto.userId, "phoneNumber");
        phone = (u as any)?.phoneNumber || "";
      } catch {}
    }
    if (!phone) throw new BadRequestException("phone is required (set your phoneNumber in profile or pass phone)");

    const msisdn = this.sanitizePhone(phone);

    // Debit wallet first (throws if insufficient)
    await this.userService.subtractFromBalance(dto.userId, amount);

    // Create TX with wallet debit markers (for idempotent refund on failure)
    const tx = await this.txModel.create({
      type: "B2C",
      status: "pending",
      amount,
      phone: msisdn,
      description: dto?.remarks || "Wallet Withdrawal",
      userId: dto.userId,
      walletDebitedAt: new Date(),
      debitUserId: dto.userId,
    });

    try {
      const token = await this.getAccessToken();
      const body = {
        InitiatorName: initiator,
        SecurityCredential: securityCredential,
        CommandID: commandId,
        Amount: amount,
        PartyA: Number(shortCode),
        PartyB: msisdn,
        Remarks: dto?.remarks || "Wallet Withdrawal",
        QueueTimeOutURL: timeoutUrl,
        ResultURL: resultUrl,
        Occasion: dto?.occasion || "Withdrawal",
      } as any;

      const { data } = await axios.post(`${this.baseUrl}/mpesa/b2c/v1/paymentrequest`, body, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });

      await this.txModel.findByIdAndUpdate(tx._id, {
        conversationId: data?.ConversationID,
        originatorConversationId: data?.OriginatorConversationID,
        rawCallback: data,
      });

      return {
        id: tx._id.toString(),
        conversationId: data?.ConversationID,
        originatorConversationId: data?.OriginatorConversationID,
        responseCode: data?.ResponseCode,
        responseDescription: data?.ResponseDescription,
      };
    } catch (e: any) {
      await this.txModel.findByIdAndUpdate(tx._id, {
        status: "failed",
        errorMessage: e?.response?.data ? JSON.stringify(e.response.data) : e?.message,
      });
      // Idempotent refund if debit done
      try {
        const claimed = await this.txModel.findOneAndUpdate(
          { _id: tx._id, walletDebitRefundedAt: { $exists: false } },
          { $set: { walletDebitRefundedAt: new Date() } },
          { new: true },
        );
        if (claimed) {
          await this.userService.addToBalance(dto.userId, amount);
          this.logger.warn(`Wallet withdrawal refunded on initiation failure: user=${dto.userId}, amount=${amount}, tx=${tx._id}`);
        }
      } catch (refErr: any) {
        this.logger.error(`Refund on initiation failure error: ${refErr?.message}`);
      }
      this.logger.error(`Wallet withdrawal B2C request error: ${e?.response?.data ? JSON.stringify(e.response.data) : e.message}`);
      throw new InternalServerErrorException("Failed to initiate wallet withdrawal");
    }
  }

  private sanitizePhone(phone: string): string {
    let p = phone.replace(/\D/g, "");
    if (p.startsWith("0")) p = `254${p.substring(1)}`;
    if (p.startsWith("7")) p = `254${p}`;
    if (!p.startsWith("254")) throw new BadRequestException("Phone must be Kenyan e.g. 2547XXXXXXXX or 07XXXXXXXX");
    return p;
  }

  private buildPassword(shortCode: string, passkey: string, timestamp: string): string {
    return Buffer.from(`${shortCode}${passkey}${timestamp}`).toString("base64");
  }

  async initiateStkPush(dto: { amount: number; phone: string; accountReference?: string; description?: string; userId?: string; }) {
    const shortCode = this.config.get<string>("MPESA_SHORTCODE") || process.env.MPESA_SHORTCODE;
    const passkey = this.config.get<string>("MPESA_PASSKEY") || process.env.MPESA_PASSKEY;
    const callbackUrl = this.config.get<string>("MPESA_CALLBACK_URL") || process.env.MPESA_CALLBACK_URL;
    if (!shortCode || !passkey) throw new BadRequestException("MPESA_SHORTCODE and MPESA_PASSKEY must be configured");
    if (!callbackUrl) this.logger.warn("MPESA_CALLBACK_URL is not set. Callback will fail unless set in Safaricom portal.");

    const token = await this.getAccessToken();

    const phone = this.sanitizePhone(dto.phone);
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14); // YYYYMMDDHHMMSS
    const password = this.buildPassword(shortCode, passkey, timestamp);

    // Debug: log basic STK info (no secrets)
    try {
      const env = this.config.get<string>("MPESA_ENV") || process.env.MPESA_ENV || "sandbox";
      let callbackHost: string | undefined;
      try { callbackHost = new URL(callbackUrl).host; } catch { callbackHost = callbackUrl; }
      const maskedPhone = phone?.replace(/^(\d{6})\d+(\d{2})$/, "$1******$2");
      this.logger.warn(`M-Pesa STK: env=${env}, baseUrl=${this.baseUrl}, shortCode=${shortCode}, amount=${Math.floor(dto.amount)}, phone=${maskedPhone}, callbackHost=${callbackHost}`);
    } catch {}

    const body = {
      BusinessShortCode: Number(shortCode),
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.floor(dto.amount),
      PartyA: phone,
      PartyB: Number(shortCode),
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: dto.accountReference || "OrbitPurchase",
      TransactionDesc: dto.description || "Purchase on Orbit",
    };

    const tx = await this.txModel.create({
      type: "STK",
      amount: body.Amount,
      phone,
      accountReference: body.AccountReference,
      description: body.TransactionDesc,
      userId: dto.userId,
      status: "pending",
    });

    try {
      const { data } = await axios.post(`${this.baseUrl}/mpesa/stkpush/v1/processrequest`, body, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });

      const { MerchantRequestID, CheckoutRequestID, ResponseCode, ResponseDescription, CustomerMessage } = data || {};

      await this.txModel.findByIdAndUpdate(tx._id, {
        merchantRequestId: MerchantRequestID,
        checkoutRequestId: CheckoutRequestID,
        rawCallback: data,
      });

      if (ResponseCode && String(ResponseCode) !== "0") {
        throw new BadRequestException(ResponseDescription || "M-Pesa STK push failed");
      }

      return {
        id: tx._id.toString(),
        checkoutRequestId: CheckoutRequestID,
        merchantRequestId: MerchantRequestID,
        message: CustomerMessage || "STK push sent",
      };
    } catch (e: any) {
      await this.txModel.findByIdAndUpdate(tx._id, {
        status: "failed",
        errorMessage: e?.response?.data ? JSON.stringify(e.response.data) : e.message,
      });
      this.logger.error(`STK push error: ${e?.response?.data ? JSON.stringify(e.response.data) : e.message}`);
      throw e instanceof BadRequestException ? e : new InternalServerErrorException("Failed to initiate STK push");
    }
  }

  private extractMetadata(items: any[]): Record<string, any> {
    const obj: Record<string, any> = {};
    if (!Array.isArray(items)) return obj;
    for (const it of items) {
      if (!it?.Name) continue;
      obj[it.Name] = it.Value ?? null;
    }
    return obj;
  }

  async handleStkCallback(payload: any) {
    try {
      const callback = payload?.Body?.stkCallback;
      if (!callback) return;
      const checkoutRequestId = callback.CheckoutRequestID;
      const merchantRequestId = callback.MerchantRequestID;
      const resultCode = Number(callback.ResultCode);
      const resultDesc = callback.ResultDesc;
      const meta = this.extractMetadata(callback?.CallbackMetadata?.Item);

      // Debug: log primary callback fields
      try {
        this.logger.warn(
          `STK callback: resultCode=${resultCode}, resultDesc=${resultDesc}, checkout=${checkoutRequestId}, merchant=${merchantRequestId}`,
        );
      } catch {}

      const update: any = {
        resultCode,
        resultDesc,
        rawCallback: payload,
        merchantRequestId,
        checkoutRequestId,
      };

      if (resultCode === 0) {
        update.status = "success";
        update.mpesaReceiptNumber = meta["MpesaReceiptNumber"] || meta["ReceiptNumber"];
        update.amount = meta["Amount"] ?? update.amount;
        update.transactionDate = meta["TransactionDate"];
        update.callbackMetadata = meta;
      } else if (resultCode === 1032) {
        update.status = "cancelled";
      } else if (resultCode === 1001) {
        update.status = "timeout";
      } else {
        update.status = "failed";
      }

      // Update by checkoutRequestId first, then fall back to merchantRequestId
      let tx = await this.txModel.findOneAndUpdate({ checkoutRequestId }, update, { new: true });
      if (!tx && merchantRequestId) {
        try { this.logger.warn(`No tx by checkoutRequestId=${checkoutRequestId}; trying merchantRequestId=${merchantRequestId}`); } catch {}
        tx = await this.txModel.findOneAndUpdate({ merchantRequestId }, update, { new: true });
      }
      // Final fallback: match latest pending STK by phone and amount from metadata
      if (!tx) {
        try {
          const phoneRaw = meta?.PhoneNumber ?? meta?.MSISDN;
          const phone = phoneRaw ? this.sanitizePhone(String(phoneRaw)) : undefined;
          const amountMeta = meta?.Amount != null ? Number(meta.Amount) : undefined;
          const filter: any = { type: 'STK', status: 'pending' };
          if (phone) filter.phone = phone;
          if (typeof amountMeta === 'number' && !Number.isNaN(amountMeta) && amountMeta > 0) filter.amount = amountMeta;
          if (filter.phone || filter.amount) {
            this.logger.warn(`No tx by IDs; trying fallback by phone/amount filter=${JSON.stringify(filter)}`);
            tx = await this.txModel.findOneAndUpdate(filter, update, { new: true, sort: { createdAt: -1 } });
          }
        } catch (e) {
          this.logger.error(`Fallback by phone/amount failed: ${e?.message}`);
        }
      }
      if (!tx) {
        try { this.logger.warn(`STK callback: No matching tx even after fallbacks (checkout=${checkoutRequestId}, merchant=${merchantRequestId})`); } catch {}
      }
      try {
        this.eventEmitter.emit('mpesa.stk.callback', tx);
        if (update.status === 'success') this.eventEmitter.emit('mpesa.stk.success', tx);
        if (update.status === 'failed') this.eventEmitter.emit('mpesa.stk.failed', tx);
        if (update.status === 'cancelled') this.eventEmitter.emit('mpesa.stk.cancelled', tx);
        if (update.status === 'timeout') this.eventEmitter.emit('mpesa.stk.timeout', tx);
      } catch (e) {
        this.logger.error(`Failed emitting mpesa events: ${e?.message}`);
      }

      // Directly update recording purchase as a safety net (in case event listener or tx match fails)
      try {
        const puUpdate: any = {
          status: update.status,
          rawCallback: payload,
          mpesaReceiptNumber: update.mpesaReceiptNumber,
          transactionDate: update.transactionDate,
          callbackMetadata: update.callbackMetadata,
          checkoutRequestId,
          merchantRequestId,
        };
        let pur = await this.purchaseModel.findOneAndUpdate(
          { checkoutRequestId },
          puUpdate,
          { new: true },
        );
        if (!pur && merchantRequestId) {
          pur = await this.purchaseModel.findOneAndUpdate(
            { merchantRequestId },
            puUpdate,
            { new: true },
          );
        }
        if (!pur && tx) {
          // Fallback by recordingId (from accountReference: REC-<id>) and userId if tx is available
          const accountRef: string | undefined = tx?.accountReference;
          let recordingId: string | undefined;
          if (accountRef && accountRef.startsWith('REC-')) recordingId = accountRef.substring(4);
          if (recordingId && tx?.userId) {
            pur = await this.purchaseModel.findOneAndUpdate(
              { recordingId, userId: tx.userId, status: { $in: ['pending', 'failed', 'cancelled', 'timeout'] } },
              puUpdate,
              { new: true, sort: { createdAt: -1 } },
            );
          }
        }
        if (pur) {
          this.logger.warn(`RecordingPurchase updated directly: ${pur._id} -> ${pur.status}`);
        } else {
          this.logger.warn(`RecordingPurchase not found to update (checkout=${checkoutRequestId}, merchant=${merchantRequestId})`);
        }
      } catch (e) {
        this.logger.error(`Direct purchase update failed: ${e?.message}`);
      }

      // Directly update gift purchase too (GIFT-<streamId>-<giftId>)
      try {
        const guUpdate: any = {
          status: update.status,
          rawCallback: payload,
          mpesaReceiptNumber: update.mpesaReceiptNumber,
          transactionDate: update.transactionDate,
          callbackMetadata: update.callbackMetadata,
          checkoutRequestId,
          merchantRequestId,
        };
        let gp = await this.giftPurchaseModel.findOneAndUpdate(
          { checkoutRequestId },
          guUpdate,
          { new: true },
        );
        if (!gp && merchantRequestId) {
          gp = await this.giftPurchaseModel.findOneAndUpdate(
            { merchantRequestId },
            guUpdate,
            { new: true },
          );
        }
        if (!gp && tx) {
          const acc = tx?.accountReference as string | undefined;
          if (acc && acc.startsWith('GIFT-') && tx.userId) {
            gp = await this.giftPurchaseModel.findOneAndUpdate(
              { accountReference: acc, senderId: tx.userId, status: { $in: ['pending', 'failed', 'cancelled', 'timeout'] } },
              guUpdate,
              { new: true, sort: { createdAt: -1 } },
            );
          }
        }
        if (gp) {
          this.logger.warn(`GiftPurchase updated directly: ${gp._id} -> ${gp.status}`);
        } else {
          this.logger.warn(`GiftPurchase not found to update (checkout=${checkoutRequestId}, merchant=${merchantRequestId})`);
        }
      } catch (e) {
        this.logger.error(`Direct gift purchase update failed: ${e?.message}`);
      }

      // Directly update support donation too (SUP-<streamId>) and credit host wallet
      try {
        const sdUpdate: any = {
          status: update.status,
          rawCallback: payload,
          mpesaReceiptNumber: update.mpesaReceiptNumber,
          transactionDate: update.transactionDate,
          callbackMetadata: update.callbackMetadata,
          checkoutRequestId,
          merchantRequestId,
        };
        let sd = await this.supportDonationModel.findOneAndUpdate(
          { checkoutRequestId },
          sdUpdate,
          { new: true },
        );
        if (!sd && merchantRequestId) {
          sd = await this.supportDonationModel.findOneAndUpdate(
            { merchantRequestId },
            sdUpdate,
            { new: true },
          );
        }
        if (!sd && tx) {
          const acc = tx?.accountReference as string | undefined;
          if (acc && acc.startsWith('SUP-') && tx.userId) {
            sd = await this.supportDonationModel.findOneAndUpdate(
              { accountReference: acc, senderId: tx.userId, status: { $in: ['pending', 'failed', 'cancelled', 'timeout'] } },
              sdUpdate,
              { new: true, sort: { createdAt: -1 } },
            );
          }
        }
        if (sd) {
          this.logger.warn(`SupportDonation updated directly: ${sd._id} -> ${sd.status}`);
          if (sd.status === 'success') {
            // Idempotent credit of receiver's wallet
            const claimed = await this.supportDonationModel.findOneAndUpdate(
              { _id: sd._id, creditedAt: { $exists: false } },
              { $set: { creditedAt: new Date() } },
              { new: true },
            );
            if (claimed) {
              try {
                await this.userService.addToBalance(sd.receiverId, sd.amountKes);
                this.logger.warn(`SupportDonation credited: host=${sd.receiverId}, amount=${sd.amountKes}, donation=${sd._id}`);
              } catch (e: any) {
                this.logger.error(`SupportDonation credit failed: ${e?.message}`);
              }
            } else {
              this.logger.warn(`SupportDonation already credited or not applicable for donation=${sd?._id}`);
            }
          }
        } else {
          this.logger.warn(`SupportDonation not found to update (checkout=${checkoutRequestId}, merchant=${merchantRequestId})`);
        }
      } catch (e) {
        this.logger.error(`Direct support donation update failed: ${e?.message}`);
      }

      // Directly update music support (MUS-<musicId>) and credit receiver wallet
      try {
        const muUpdate: any = {
          status: update.status,
          rawCallback: payload,
          mpesaReceiptNumber: update.mpesaReceiptNumber,
          transactionDate: update.transactionDate,
          callbackMetadata: update.callbackMetadata,
          checkoutRequestId,
          merchantRequestId,
        };
        let ms = await this.musicSupportModel.findOneAndUpdate(
          { checkoutRequestId },
          muUpdate,
          { new: true },
        );
        if (!ms && merchantRequestId) {
          ms = await this.musicSupportModel.findOneAndUpdate(
            { merchantRequestId },
            muUpdate,
            { new: true },
          );
        }
        if (!ms && tx) {
          const acc = tx?.accountReference as string | undefined;
          if (acc && acc.startsWith('MUS-') && tx.userId) {
            ms = await this.musicSupportModel.findOneAndUpdate(
              { accountReference: acc, senderId: tx.userId, status: { $in: ['pending', 'failed', 'cancelled', 'timeout'] } },
              muUpdate,
              { new: true, sort: { createdAt: -1 } },
            );
          }
        }
        if (ms) {
          this.logger.warn(`MusicSupport updated directly: ${ms._id} -> ${ms.status}`);
          if (ms.status === 'success') {
            const claimed = await this.musicSupportModel.findOneAndUpdate(
              { _id: ms._id, creditedAt: { $exists: false } },
              { $set: { creditedAt: new Date() } },
              { new: true },
            );
            if (claimed) {
              try {
                await this.userService.addToBalance(ms.receiverId, ms.amountKes);
                this.logger.warn(`MusicSupport credited: receiver=${ms.receiverId}, amount=${ms.amountKes}, support=${ms._id}`);
              } catch (e: any) {
                this.logger.error(`MusicSupport credit failed: ${e?.message}`);
              }
            } else {
              this.logger.warn(`MusicSupport already credited or not applicable for support=${ms?._id}`);
            }
          }
        } else {
          this.logger.warn(`MusicSupport not found to update (checkout=${checkoutRequestId}, merchant=${merchantRequestId})`);
        }
      } catch (e) {
        this.logger.error(`Direct music support update failed: ${e?.message}`);
      }

      // Directly update article support (ART-<articleId>) and credit receiver wallet
      try {
        const auUpdate: any = {
          status: update.status,
          rawCallback: payload,
          mpesaReceiptNumber: update.mpesaReceiptNumber,
          transactionDate: update.transactionDate,
          callbackMetadata: update.callbackMetadata,
          checkoutRequestId,
          merchantRequestId,
        };
        let as = await this.articleSupportModel.findOneAndUpdate(
          { checkoutRequestId },
          auUpdate,
          { new: true },
        );
        if (!as && merchantRequestId) {
          as = await this.articleSupportModel.findOneAndUpdate(
            { merchantRequestId },
            auUpdate,
            { new: true },
          );
        }
        if (!as && tx) {
          const acc = tx?.accountReference as string | undefined;
          if (acc && acc.startsWith('ART-') && tx.userId) {
            as = await this.articleSupportModel.findOneAndUpdate(
              { accountReference: acc, senderId: tx.userId, status: { $in: ['pending', 'failed', 'cancelled', 'timeout'] } },
              auUpdate,
              { new: true, sort: { createdAt: -1 } },
            );
          }
        }
        if (as) {
          this.logger.warn(`ArticleSupport updated directly: ${as._id} -> ${as.status}`);
          if (as.status === 'success') {
            const claimed = await this.articleSupportModel.findOneAndUpdate(
              { _id: as._id, creditedAt: { $exists: false } },
              { $set: { creditedAt: new Date() } },
              { new: true },
            );
            if (claimed) {
              try {
                await this.userService.addToBalance(as.receiverId, as.amountKes);
                this.logger.warn(`ArticleSupport credited: receiver=${as.receiverId}, amount=${as.amountKes}, support=${as._id}`);
              } catch (e: any) {
                this.logger.error(`ArticleSupport credit failed: ${e?.message}`);
              }
            } else {
              this.logger.warn(`ArticleSupport already credited or not applicable for support=${as?._id}`);
            }
          }
        } else {
          this.logger.warn(`ArticleSupport not found to update (checkout=${checkoutRequestId}, merchant=${merchantRequestId})`);
        }
      } catch (e) {
        this.logger.error(`Direct article support update failed: ${e?.message}`);
      }

      // Directly update ad submission (AD-<submissionId>) and create Ad document on success, idempotently
      try {
        const adUpdate: any = {
          status: update.status,
          rawCallback: payload,
          mpesaReceiptNumber: update.mpesaReceiptNumber,
          transactionDate: update.transactionDate,
          callbackMetadata: update.callbackMetadata,
          checkoutRequestId,
          merchantRequestId,
        };
        let adSub = await this.adSubmissionModel.findOneAndUpdate(
          { checkoutRequestId },
          adUpdate,
          { new: true },
        );
        if (!adSub && merchantRequestId) {
          adSub = await this.adSubmissionModel.findOneAndUpdate(
            { merchantRequestId },
            adUpdate,
            { new: true },
          );
        }
        if (!adSub && tx) {
          const acc = tx?.accountReference as string | undefined;
          if (acc && acc.startsWith('AD-') && tx.userId) {
            adSub = await this.adSubmissionModel.findOneAndUpdate(
              { accountReference: acc, userId: tx.userId, status: { $in: ['pending', 'failed', 'cancelled', 'timeout'] } },
              adUpdate,
              { new: true, sort: { createdAt: -1 } },
            );
          }
        }
        if (adSub) {
          this.logger.warn(`AdSubmission updated directly: ${adSub._id} -> ${adSub.status}`);
          if (adSub.status === 'success') {
            // Idempotently create Ad once
            const claimed = await this.adSubmissionModel.findOneAndUpdate(
              { _id: adSub._id, $or: [{ adId: { $exists: false } }, { adId: null }] },
              { $set: { adId: '__creating__' } },
              { new: true },
            );
            if (claimed) {
              try {
                const created = await this.adsService.create({
                  userId: adSub.userId,
                  title: adSub.title,
                  imageUrl: adSub.imageUrl,
                  linkUrl: adSub.linkUrl || undefined,
                  status: 'pending',
                  feeAtSubmission: adSub.amountKes,
                  submissionId: adSub._id.toString(),
                });
                const adId = (Array.isArray(created) ? created[0]?._id : created?._id) || created?.id || created?._id;
                if (adId) {
                  await this.adSubmissionModel.findByIdAndUpdate(adSub._id, { $set: { adId: adId.toString() } });
                }
                this.logger.warn(`Ad created from submission: submission=${adSub._id}, ad=${adId}`);
              } catch (e: any) {
                this.logger.error(`Ad creation from submission failed: ${e?.message}`);
              }
            } else {
              this.logger.warn(`Ad already created or claimed for submission=${adSub?._id}`);
            }
          }
        } else {
          this.logger.warn(`AdSubmission not found to update (checkout=${checkoutRequestId}, merchant=${merchantRequestId})`);
        }
      } catch (e) {
        this.logger.error(`Direct ad submission update failed: ${e?.message}`);
      }

      // Wallet top-up: credit user balance on success, idempotently
      try {
        if (tx && update.status === 'success') {
          const acc: string | undefined = tx?.accountReference;
          const isWalletTopup = !!acc && acc.toUpperCase().startsWith('WALLET');
          const userId: string | undefined = tx?.userId as any;
          const amount: number | undefined = typeof tx?.amount === 'number' ? tx.amount : undefined;
          if (isWalletTopup && userId && amount && amount > 0) {
            // Ensure we only credit once using walletCreditedAt flag
            const claimed = await this.txModel.findOneAndUpdate(
              { _id: tx._id, walletCreditedAt: { $exists: false } },
              { $set: { walletCreditedAt: new Date() } },
              { new: true },
            );
            if (claimed) {
              await this.userService.addToBalance(userId, amount);
              this.logger.warn(`Wallet top-up credited: user=${userId}, amount=${amount}, tx=${tx._id}`);
            } else {
              this.logger.warn(`Wallet top-up already credited or not applicable for tx=${tx?._id}`);
            }
          }
        }
      } catch (e) {
        this.logger.error(`Wallet top-up crediting failed: ${e?.message}`);
      }
      return tx;
    } catch (e) {
      this.logger.error(`handleStkCallback error: ${e.message}`);
      throw new InternalServerErrorException();
    }
  }

  async findTxById(id: string) {
    return this.txModel.findById(id);
  }

  async getWalletTopups(userId: string, limit: number = 20) {
    if (!userId) throw new BadRequestException('Missing userId');
    const docs = await this.txModel
      .find({
        userId,
        type: 'STK',
        accountReference: { $regex: /^WALLET/i },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return docs.map((d: any) => ({
      id: d._id?.toString?.() ?? d._id,
      amount: d.amount,
      status: d.status,
      mpesaReceiptNumber: d.mpesaReceiptNumber,
      accountReference: d.accountReference,
      createdAt: d.createdAt,
      transactionDate: d.transactionDate,
    }));
  }

  async findTxByCheckoutId(checkoutRequestId: string) {
    return this.txModel.findOne({ checkoutRequestId });
  }

  async findLatestStkByUserAndAccount(userId: string, accountReference: string) {
    return this.txModel
      .findOne({ type: 'STK', userId, accountReference })
      .sort({ createdAt: -1 });
  }

  async queryStkPushStatus(checkoutRequestId: string) {
    const shortCode = this.config.get<string>("MPESA_SHORTCODE") || process.env.MPESA_SHORTCODE;
    const passkey = this.config.get<string>("MPESA_PASSKEY") || process.env.MPESA_PASSKEY;
    if (!shortCode || !passkey) throw new BadRequestException("MPESA_SHORTCODE and MPESA_PASSKEY must be configured");

    const token = await this.getAccessToken();
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const password = this.buildPassword(shortCode, passkey, timestamp);

    const body = {
      BusinessShortCode: Number(shortCode),
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };

    try {
      const { data } = await axios.post(`${this.baseUrl}/mpesa/stkpushquery/v1/query`, body, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      return data;
    } catch (e: any) {
      this.logger.error(`queryStkPushStatus error: ${e?.response?.data ? JSON.stringify(e.response.data) : e.message}`);
      throw new InternalServerErrorException("Failed to query STK status");
    }
  }

  // ===== C2B (Validation/Confirmation) =====
  async simulateC2B(dto: { amount: number; msisdn: string; billRefNumber?: string }) {
    const shortCode = this.config.get<string>("MPESA_SHORTCODE") || process.env.MPESA_SHORTCODE;
    if (!shortCode) throw new BadRequestException("MPESA_SHORTCODE must be configured");
    const token = await this.getAccessToken();
    const msisdn = this.sanitizePhone(dto.msisdn);
    const body = {
      ShortCode: Number(shortCode),
      CommandID: "CustomerPayBillOnline",
      Amount: Math.floor(dto.amount),
      Msisdn: msisdn,
      BillRefNumber: dto.billRefNumber || "TestPayment",
    };
    try {
      const { data } = await axios.post(`${this.baseUrl}/mpesa/c2b/v1/simulate`, body, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      return data;
    } catch (e: any) {
      this.logger.error(`simulateC2B error: ${e?.response?.data ? JSON.stringify(e.response.data) : e.message}`);
      throw new InternalServerErrorException("Failed to simulate C2B");
    }
  }

  async registerC2BUrls() {
    const shortCode = this.config.get<string>("MPESA_SHORTCODE") || process.env.MPESA_SHORTCODE;
    const confirmationUrl = this.config.get<string>("MPESA_C2B_CONFIRMATION_URL") || process.env.MPESA_C2B_CONFIRMATION_URL;
    const validationUrl = this.config.get<string>("MPESA_C2B_VALIDATION_URL") || process.env.MPESA_C2B_VALIDATION_URL;
    if (!shortCode || !confirmationUrl || !validationUrl) {
      throw new BadRequestException("MPESA_SHORTCODE, MPESA_C2B_CONFIRMATION_URL and MPESA_C2B_VALIDATION_URL must be configured");
    }
    const token = await this.getAccessToken();
    const body = {
      ShortCode: Number(shortCode),
      ResponseType: "Completed",
      ConfirmationURL: confirmationUrl,
      ValidationURL: validationUrl,
    };
    try {
      const { data } = await axios.post(`${this.baseUrl}/mpesa/c2b/v1/registerurl`, body, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      return data;
    } catch (e: any) {
      this.logger.error(`registerC2BUrls error: ${e?.response?.data ? JSON.stringify(e.response.data) : e.message}`);
      throw new InternalServerErrorException("Failed to register C2B URLs");
    }
  }

  async handleC2BValidation(payload: any) {
    // Add your own validation logic using payload.BillRefNumber etc.
    this.logger.log(`C2B validation: ${JSON.stringify(payload)}`);
    return { ResultCode: 0, ResultDesc: "Accepted" };
  }

  async handleC2BConfirmation(payload: any) {
    try {
      this.logger.log(`C2B confirmation: ${JSON.stringify(payload)}`);
      const amount = Number(payload?.TransAmount ?? 0);
      const phone = payload?.MSISDN ? this.sanitizePhone(String(payload.MSISDN)) : undefined;
      const transTime = payload?.TransTime ? Number(payload.TransTime) : undefined;
      const transId = payload?.TransID as string | undefined;
      const accountRef = payload?.BillRefNumber as string | undefined;

      await this.txModel.create({
        type: "C2B",
        status: "success",
        amount,
        phone,
        transactionDate: transTime,
        transactionId: transId,
        accountReference: accountRef,
        description: payload?.TransactionType,
        rawCallback: payload,
        callbackMetadata: payload,
      });
      return { ResultCode: 0, ResultDesc: "Accepted" };
    } catch (e: any) {
      this.logger.error(`handleC2BConfirmation error: ${e?.message}`);
      return { ResultCode: 1, ResultDesc: "Error" };
    }
  }

  // ===== B2C (Business to Customer) =====
  async initiateB2C(dto: { amount: number; phone: string; remarks?: string; occasion?: string; userId?: string }) {
    const shortCode = this.config.get<string>("MPESA_SHORTCODE") || process.env.MPESA_SHORTCODE;
    const initiator = this.config.get<string>("MPESA_INITIATOR_NAME") || process.env.MPESA_INITIATOR_NAME;
    const securityCredential = this.config.get<string>("MPESA_SECURITY_CREDENTIAL") || process.env.MPESA_SECURITY_CREDENTIAL;
    const resultUrl = this.config.get<string>("MPESA_B2C_RESULT_URL") || process.env.MPESA_B2C_RESULT_URL;
    const timeoutUrl = this.config.get<string>("MPESA_B2C_TIMEOUT_URL") || process.env.MPESA_B2C_TIMEOUT_URL;
    const commandId = this.config.get<string>("MPESA_B2C_COMMAND_ID") || process.env.MPESA_B2C_COMMAND_ID || "BusinessPayment";
    if (!shortCode || !initiator || !securityCredential || !resultUrl || !timeoutUrl) {
      throw new BadRequestException("Missing B2C configuration (shortcode, initiator, security credential, result/timeout URLs)");
    }

    const token = await this.getAccessToken();
    const phone = this.sanitizePhone(dto.phone);
    const body = {
      InitiatorName: initiator,
      SecurityCredential: securityCredential,
      CommandID: commandId,
      Amount: Math.floor(dto.amount),
      PartyA: Number(shortCode),
      PartyB: phone,
      Remarks: dto.remarks || "Payment",
      QueueTimeOutURL: timeoutUrl,
      ResultURL: resultUrl,
      Occasion: dto.occasion || "Payment",
    };

    const tx = await this.txModel.create({
      type: "B2C",
      status: "pending",
      amount: body.Amount,
      phone,
      description: body.Remarks,
      userId: dto.userId,
    });

    try {
      const { data } = await axios.post(`${this.baseUrl}/mpesa/b2c/v1/paymentrequest`, body, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });

      // Expected fields: ConversationID, OriginatorConversationID, ResponseCode, ResponseDescription
      await this.txModel.findByIdAndUpdate(tx._id, {
        conversationId: data?.ConversationID,
        originatorConversationId: data?.OriginatorConversationID,
        rawCallback: data,
      });
      return {
        id: tx._id.toString(),
        conversationId: data?.ConversationID,
        originatorConversationId: data?.OriginatorConversationID,
        responseCode: data?.ResponseCode,
        responseDescription: data?.ResponseDescription,
      };
    } catch (e: any) {
      await this.txModel.findByIdAndUpdate(tx._id, {
        status: "failed",
        errorMessage: e?.response?.data ? JSON.stringify(e.response.data) : e.message,
      });
      this.logger.error(`B2C request error: ${e?.response?.data ? JSON.stringify(e.response.data) : e.message}`);
      throw new InternalServerErrorException("Failed to initiate B2C payment");
    }
  }

  async handleB2CResult(payload: any) {
    try {
      const result = payload?.Result;
      const conversationId = result?.ConversationID;
      const originatorConversationId = result?.OriginatorConversationID;
      const resultCode = Number(result?.ResultCode);
      const resultDesc = result?.ResultDesc as string | undefined;
      const txId = result?.TransactionID as string | undefined;
      const params = result?.ResultParameters?.ResultParameter ?? [];

      const meta: Record<string, any> = {};
      for (const p of params) {
        if (p?.Key) meta[p.Key] = p.Value;
      }

      const update: any = {
        resultCode,
        resultDesc,
        transactionId: txId,
        callbackMetadata: meta,
        rawCallback: payload,
      };

      update.status = resultCode === 0 ? "success" : "failed";

      const tx = await this.txModel.findOneAndUpdate(
        {
          $or: [
            { conversationId: conversationId },
            { originatorConversationId: originatorConversationId },
          ],
        },
        update,
        { new: true }
      );
      // If this B2C was a wallet withdrawal and it failed, refund once
      try {
        if (tx && tx.debitUserId && tx.walletDebitedAt && update.status !== 'success') {
          const claimed = await this.txModel.findOneAndUpdate(
            { _id: tx._id, walletDebitRefundedAt: { $exists: false } },
            { $set: { walletDebitRefundedAt: new Date() } },
            { new: true },
          );
          if (claimed) {
            await this.userService.addToBalance(tx.debitUserId, tx.amount);
            this.logger.warn(`Wallet withdrawal refunded after B2C ${update.status}: user=${tx.debitUserId}, amount=${tx.amount}, tx=${tx._id}`);
          }
        }
      } catch (e: any) {
        this.logger.error(`B2C result refund error: ${e?.message}`);
      }
      return tx;
    } catch (e: any) {
      this.logger.error(`handleB2CResult error: ${e?.message}`);
      throw new InternalServerErrorException();
    }
  }

  async handleB2CTimeout(payload: any) {
    try {
      const originatorConversationId = payload?.OriginatorConversationID || payload?.Result?.OriginatorConversationID;
      const update = {
        status: "timeout" as const,
        rawCallback: payload,
      };
      const tx = await this.txModel.findOneAndUpdate({ originatorConversationId }, update, { new: true });
      // Refund wallet on timeout if this was a wallet withdrawal
      try {
        if (tx && tx.debitUserId && tx.walletDebitedAt) {
          const claimed = await this.txModel.findOneAndUpdate(
            { _id: tx._id, walletDebitRefundedAt: { $exists: false } },
            { $set: { walletDebitRefundedAt: new Date() } },
            { new: true },
          );
          if (claimed) {
            await this.userService.addToBalance(tx.debitUserId, tx.amount);
            this.logger.warn(`Wallet withdrawal refunded after B2C timeout: user=${tx.debitUserId}, amount=${tx.amount}, tx=${tx._id}`);
          }
        }
      } catch (e: any) {
        this.logger.error(`B2C timeout refund error: ${e?.message}`);
      }
      return tx;
    } catch (e: any) {
      this.logger.error(`handleB2CTimeout error: ${e?.message}`);
      throw new InternalServerErrorException();
    }
  }

  // ===== Transaction Status & Reversal =====
  async transactionStatus(transactionId: string) {
    const shortCode = this.config.get<string>("MPESA_SHORTCODE") || process.env.MPESA_SHORTCODE;
    const initiator = this.config.get<string>("MPESA_INITIATOR_NAME") || process.env.MPESA_INITIATOR_NAME;
    const securityCredential = this.config.get<string>("MPESA_SECURITY_CREDENTIAL") || process.env.MPESA_SECURITY_CREDENTIAL;
    const resultUrl = this.config.get<string>("MPESA_B2C_RESULT_URL") || process.env.MPESA_B2C_RESULT_URL;
    const timeoutUrl = this.config.get<string>("MPESA_B2C_TIMEOUT_URL") || process.env.MPESA_B2C_TIMEOUT_URL;
    if (!shortCode || !initiator || !securityCredential) throw new BadRequestException("Missing transaction status configuration");

    const token = await this.getAccessToken();
    const body = {
      Initiator: initiator,
      SecurityCredential: securityCredential,
      CommandID: "TransactionStatusQuery",
      TransactionID: transactionId,
      PartyA: Number(shortCode),
      IdentifierType: "4",
      ResultURL: resultUrl,
      QueueTimeOutURL: timeoutUrl,
      Remarks: "Status Check",
      Occasion: "TransactionStatus",
    } as any;

    try {
      const { data } = await axios.post(`${this.baseUrl}/mpesa/transactionstatus/v1/query`, body, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });
      return data;
    } catch (e: any) {
      this.logger.error(`transactionStatus error: ${e?.response?.data ? JSON.stringify(e.response.data) : e.message}`);
      throw new InternalServerErrorException("Failed to query transaction status");
    }
  }

  async reverseTransaction(dto: { transactionId: string; amount: number; remarks?: string }) {
    const shortCode = this.config.get<string>("MPESA_SHORTCODE") || process.env.MPESA_SHORTCODE;
    const initiator = this.config.get<string>("MPESA_INITIATOR_NAME") || process.env.MPESA_INITIATOR_NAME;
    const securityCredential = this.config.get<string>("MPESA_SECURITY_CREDENTIAL") || process.env.MPESA_SECURITY_CREDENTIAL;
    const resultUrl = this.config.get<string>("MPESA_B2C_RESULT_URL") || process.env.MPESA_B2C_RESULT_URL;
    const timeoutUrl = this.config.get<string>("MPESA_B2C_TIMEOUT_URL") || process.env.MPESA_B2C_TIMEOUT_URL;
    if (!shortCode || !initiator || !securityCredential) throw new BadRequestException("Missing reversal configuration");

    const token = await this.getAccessToken();
    const body = {
      Initiator: initiator,
      SecurityCredential: securityCredential,
      CommandID: "TransactionReversal",
      TransactionID: dto.transactionId,
      Amount: Math.floor(dto.amount),
      ReceiverParty: Number(shortCode),
      ReceiverIdentifierType: "11",
      ResultURL: resultUrl,
      QueueTimeOutURL: timeoutUrl,
      Remarks: dto.remarks || "Reversal",
      Occasion: "Reversal",
    } as any;

    try {
      const { data } = await axios.post(`${this.baseUrl}/mpesa/reversal/v1/request`, body, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });
      return data;
    } catch (e: any) {
      this.logger.error(`reverseTransaction error: ${e?.response?.data ? JSON.stringify(e.response.data) : e.message}`);
      throw new InternalServerErrorException("Failed to request reversal");
    }
  }
}
