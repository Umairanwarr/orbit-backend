import { BadRequestException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import crypto from "crypto";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import {
  PaystackTransaction,
  PaystackTransactionDocument,
} from "./schemas/paystack-transaction.schema";
import { UserService } from "../../user_modules/user/user.service";

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);

  private get baseUrl() {
    return this.config.get<string>("PAYSTACK_BASE_URL") || process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";
  }

  private get secretKey() {
    return this.config.get<string>("PAYSTACK_SECRET_KEY") || process.env.PAYSTACK_SECRET_KEY;
  }

  private get publicKey() {
    return this.config.get<string>("PAYSTACK_PUBLIC_KEY") || process.env.PAYSTACK_PUBLIC_KEY;
  }

  private get defaultCurrency() {
    return this.config.get<string>("PAYSTACK_CURRENCY") || process.env.PAYSTACK_CURRENCY || "KES";
  }

  private get callbackUrl() {
    return this.config.get<string>("PAYSTACK_CALLBACK_URL") || process.env.PAYSTACK_CALLBACK_URL || null;
  }

  constructor(
    private readonly config: ConfigService,
    @InjectModel(PaystackTransaction.name)
    private readonly txModel: Model<PaystackTransactionDocument>,
    private readonly userService: UserService,
  ) { }

  getPublicKey() {
    return this.publicKey || null;
  }

  private requireSecret() {
    if (!this.secretKey) throw new BadRequestException("PAYSTACK_SECRET_KEY not configured");
    return this.secretKey;
  }

  private toMinor(amount: number) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) throw new BadRequestException("amount must be > 0");
    const minor = Math.round(n * 100);
    if (!Number.isFinite(minor) || minor <= 0) throw new BadRequestException("invalid amount");
    return { major: n, minor };
  }

  private async paystackGet(path: string, params?: Record<string, any>) {
    const key = this.requireSecret();
    try {
      const { data } = await axios.get(`${this.baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${key}` },
        params,
        timeout: 20000,
      });
      return data;
    } catch (e: any) {
      const msg = e?.response?.data ? JSON.stringify(e.response.data) : e?.message;
      this.logger.error(`Paystack GET ${path} error: ${msg}`);
      throw new InternalServerErrorException("Paystack request failed");
    }
  }

  private async paystackPost(path: string, body: any) {
    const key = this.requireSecret();
    try {
      const { data } = await axios.post(`${this.baseUrl}${path}`, body, {
        headers: { Authorization: `Bearer ${key}` },
        timeout: 20000,
      });
      return data;
    } catch (e: any) {
      const msg = e?.response?.data ? JSON.stringify(e.response.data) : e?.message;
      this.logger.error(`Paystack POST ${path} error: ${msg}`);
      throw new InternalServerErrorException("Paystack request failed");
    }
  }

  async initializeTopup(dto: { userId: string; amount: number; currency?: string }) {
    if (!dto?.userId) throw new BadRequestException("Missing userId");

    const { major, minor } = this.toMinor(dto.amount);
    const currency = (dto.currency || this.defaultCurrency || "KES").toString().toUpperCase();

    const user = await this.userService.findById(dto.userId, "email fullName");
    const email = (user as any)?.email;
    if (!email) throw new BadRequestException("User email is required for Paystack");

    const reference = `WALLET_${dto.userId}_${uuidv4()}`;

    const tx = await this.txModel.create({
      type: "TOPUP",
      status: "pending",
      amount: major,
      amountBase: minor,
      currency,
      userId: dto.userId,
      reference,
    });

    const initializeBody: any = {
      amount: minor,
      email,
      currency,
      reference,
      metadata: {
        userId: dto.userId,
        type: "WALLET_TOPUP",
      },
    };

    if (this.callbackUrl) {
      initializeBody.callback_url = this.callbackUrl;
    }

    const initRes = await this.paystackPost("/transaction/initialize", initializeBody);
    const ok = !!initRes?.status;
    if (!ok) {
      await this.txModel.findByIdAndUpdate(tx._id, {
        status: "failed",
        rawInitialize: initRes,
        errorMessage: initRes?.message || "initialize failed",
      });
      throw new InternalServerErrorException("Failed to initialize Paystack transaction");
    }

    await this.txModel.findByIdAndUpdate(tx._id, {
      authorizationUrl: initRes?.data?.authorization_url,
      accessCode: initRes?.data?.access_code,
      rawInitialize: initRes,
    });

    return {
      id: tx._id.toString(),
      reference,
      authorizationUrl: initRes?.data?.authorization_url,
      accessCode: initRes?.data?.access_code,
      amount: major,
      currency,
    };
  }

  async getWalletTopups(userId: string, limit: number = 20) {
    if (!userId) throw new BadRequestException("Missing userId");
    const l = Number.isFinite(Number(limit)) ? Math.min(Math.max(Number(limit), 1), 50) : 20;
    return this.txModel
      .find({ userId, type: "TOPUP" })
      .sort({ createdAt: -1 })
      .limit(l)
      .lean();
  }

  async findTxById(id: string, userId?: string) {
    const tx: any = await this.txModel.findById(id).lean();
    if (!tx) throw new BadRequestException("Transaction not found");
    if (userId && tx?.userId && tx.userId !== userId) {
      throw new BadRequestException("Not allowed");
    }
    return tx;
  }

  async verifyTopup(dto: { userId: string; reference: string }) {
    if (!dto?.userId) throw new BadRequestException("Missing userId");
    const reference = (dto.reference || "").toString().trim();
    if (!reference) throw new BadRequestException("reference is required");

    const tx = await this.txModel.findOne({ reference }).lean();
    if (tx?.userId && tx.userId !== dto.userId) {
      throw new BadRequestException("This reference does not belong to you");
    }

    const verifyRes = await this.paystackGet(`/transaction/verify/${encodeURIComponent(reference)}`);

    const payData = verifyRes?.data;
    const metaUserId = (payData?.metadata?.userId || "").toString().trim();
    if (metaUserId && metaUserId !== dto.userId) {
      throw new BadRequestException("This reference does not belong to you");
    }

    const status = payData?.status;
    const isSuccess = status === "success";

    const amountBase = Number(payData?.amount);
    const amountMajor = Number.isFinite(amountBase) ? amountBase / 100 : undefined;

    const resolvedUserId = tx?.userId || metaUserId || dto.userId;

    const update: any = {
      userId: resolvedUserId,
      rawVerify: verifyRes,
      gatewayResponse: payData?.gateway_response,
      channel: payData?.channel,
      paidAt: payData?.paid_at ? new Date(payData.paid_at) : undefined,
      currency: (payData?.currency || tx?.currency || this.defaultCurrency).toString().toUpperCase(),
      amount: amountMajor ?? tx?.amount,
      amountBase: Number.isFinite(amountBase) ? amountBase : tx?.amountBase,
      status: isSuccess ? "success" : "failed",
    };

    const saved = await this.txModel.findOneAndUpdate(
      { reference },
      { $set: update, $setOnInsert: { type: "TOPUP", userId: resolvedUserId, reference } },
      { new: true, upsert: true },
    );

    if (isSuccess) {
      const claimed = await this.txModel.findOneAndUpdate(
        { _id: saved._id, walletCreditedAt: { $exists: false } },
        { $set: { walletCreditedAt: new Date() } },
        { new: true },
      );
      if (claimed) {
        await this.userService.addToBalance(resolvedUserId, Number(saved.amount) || 0);
      }
    }

    return {
      reference,
      status: saved.status,
      amount: saved.amount,
      currency: saved.currency,
      paidAt: saved.paidAt,
    };
  }

  async withdrawToBank(dto: {
    userId: string;
    amount: number;
    accountNumber: string;
    bankCode: string;
    currency?: string;
    recipientType?: string;
    name?: string;
    reason?: string;
  }) {
    if (!dto?.userId) throw new BadRequestException("Missing userId");

    const { major, minor } = this.toMinor(dto.amount);

    const currency = (dto.currency || this.defaultCurrency || "KES").toString().toUpperCase();
    const recipientType = (dto.recipientType || "nuban").toString();

    const accountNumber = (dto.accountNumber || "").toString().trim();
    const bankCode = (dto.bankCode || "").toString().trim();
    if (!accountNumber) throw new BadRequestException("accountNumber is required");
    if (!bankCode) throw new BadRequestException("bankCode is required");

    await this.userService.subtractFromBalance(dto.userId, major);

    const reference = `WITHDRAW_${dto.userId}_${uuidv4()}`;

    const tx = await this.txModel.create({
      type: "TRANSFER",
      status: "pending",
      amount: major,
      amountBase: minor,
      currency,
      userId: dto.userId,
      reference,
      walletDebitedAt: new Date(),
    });

    try {
      const recipientRes = await this.paystackPost("/transferrecipient", {
        type: recipientType,
        name: dto.name || `Orbit User ${dto.userId}`,
        account_number: accountNumber,
        bank_code: bankCode,
        currency,
      });

      if (!recipientRes?.status || !recipientRes?.data?.recipient_code) {
        throw new Error(recipientRes?.message || "Failed to create transfer recipient");
      }

      const recipientCode = recipientRes.data.recipient_code;

      const transferRes = await this.paystackPost("/transfer", {
        source: "balance",
        amount: minor,
        recipient: recipientCode,
        reason: dto.reason || "Wallet withdrawal",
        reference,
      });

      if (!transferRes?.status) {
        throw new Error(transferRes?.message || "Failed to initiate transfer");
      }

      await this.txModel.findByIdAndUpdate(tx._id, {
        recipientCode,
        transferCode: transferRes?.data?.transfer_code,
        rawInitialize: { recipientRes, transferRes },
      });

      return {
        id: tx._id.toString(),
        reference,
        status: "pending",
        amount: major,
        currency,
        recipientCode,
        transferCode: transferRes?.data?.transfer_code,
      };
    } catch (e: any) {
      await this.txModel.findByIdAndUpdate(tx._id, {
        status: "failed",
        errorMessage: e?.message,
      });

      try {
        const claimed = await this.txModel.findOneAndUpdate(
          { _id: tx._id, walletDebitRefundedAt: { $exists: false } },
          { $set: { walletDebitRefundedAt: new Date() } },
          { new: true },
        );
        if (claimed) {
          await this.userService.addToBalance(dto.userId, major);
        }
      } catch (refundErr: any) {
        this.logger.error(`Paystack withdraw refund error: ${refundErr?.message}`);
      }

      throw new InternalServerErrorException("Failed to initiate withdrawal");
    }
  }

  async listBanks(dto: { country?: string; currency?: string }) {
    const params: any = {};
    if (dto?.country) params.country = dto.country;
    if (dto?.currency) params.currency = dto.currency;
    const res = await this.paystackGet("/bank", params);
    return res?.data ?? res;
  }

  async resolveAccount(dto: { accountNumber: string; bankCode: string }) {
    const accountNumber = (dto?.accountNumber || "").toString().trim();
    const bankCode = (dto?.bankCode || "").toString().trim();
    if (!accountNumber) throw new BadRequestException("accountNumber is required");
    if (!bankCode) throw new BadRequestException("bankCode is required");
    const res = await this.paystackGet("/bank/resolve", {
      account_number: accountNumber,
      bank_code: bankCode,
    });
    return res?.data ?? res;
  }

  async handleWebhook(dto: { signature: string; rawBody: string; body: any }) {
    const key = this.requireSecret();
    const signature = (dto?.signature || "").toString();
    const rawBody = (dto?.rawBody || "").toString();

    if (!signature || !rawBody) return;

    const hash = crypto.createHmac("sha512", key).update(rawBody).digest("hex");
    if (hash !== signature) {
      this.logger.warn("Paystack webhook signature mismatch");
      return;
    }

    const event = dto?.body?.event;
    const data = dto?.body?.data;

    if (!event || !data) return;

    if (event === "charge.success") {
      const reference = (data?.reference || "").toString();
      if (!reference) return;

      const amountBase = Number(data?.amount);
      const amountMajor = Number.isFinite(amountBase) ? amountBase / 100 : 0;

      const userId = (data?.metadata?.userId || "").toString() || undefined;

      const saved = await this.txModel.findOneAndUpdate(
        { reference },
        {
          $set: {
            type: "TOPUP",
            status: "success",
            amount: amountMajor,
            amountBase: Number.isFinite(amountBase) ? amountBase : Math.round(amountMajor * 100),
            currency: (data?.currency || this.defaultCurrency).toString().toUpperCase(),
            userId,
            reference,
            paidAt: data?.paid_at ? new Date(data.paid_at) : new Date(),
            channel: data?.channel,
            gatewayResponse: data?.gateway_response,
            rawVerify: dto.body,
          },
        },
        { new: true, upsert: true },
      );

      if (saved?.userId) {
        const claimed = await this.txModel.findOneAndUpdate(
          { _id: saved._id, walletCreditedAt: { $exists: false } },
          { $set: { walletCreditedAt: new Date() } },
          { new: true },
        );
        if (claimed) {
          await this.userService.addToBalance(saved.userId, Number(saved.amount) || 0);
        }
      }
    }

    if (event === "transfer.success" || event === "transfer.failed") {
      const reference = (data?.reference || "").toString();
      const transferCode = (data?.transfer_code || "").toString();

      const isSuccess = event === "transfer.success";
      const status = isSuccess ? "success" : "failed";

      const tx = await this.txModel.findOneAndUpdate(
        {
          $or: [
            reference ? { reference } : null,
            transferCode ? { transferCode } : null,
          ].filter(Boolean) as any,
        },
        {
          $set: {
            status,
            transferCode: transferCode || undefined,
            rawVerify: dto.body,
          },
        },
        { new: true },
      );

      if (!isSuccess && tx?.userId && tx?.walletDebitedAt) {
        const claimed = await this.txModel.findOneAndUpdate(
          { _id: tx._id, walletDebitRefundedAt: { $exists: false } },
          { $set: { walletDebitRefundedAt: new Date() } },
          { new: true },
        );
        if (claimed) {
          await this.userService.addToBalance(tx.userId, Number(tx.amount) || 0);
        }
      }
    }
  }
}
