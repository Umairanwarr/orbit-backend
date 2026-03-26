import { Body, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { V1Controller } from "../../../core/common/v1-controller.decorator";
import { resOK } from "../../../core/utils/res.helpers";
import { VerifiedAuthGuard } from "../../../core/guards/verified.auth.guard";
import { PaystackService } from "./paystack.service";
import { PaystackInitializeTopupDto } from "./dto/paystack-initialize-topup.dto";
import { PaystackWithdrawDto } from "./dto/paystack-withdraw.dto";

@V1Controller("payments/paystack")
export class PaystackController {
  constructor(private readonly paystackService: PaystackService) { }

  @Get("/public-key")
  async publicKey() {
    return resOK({ publicKey: this.paystackService.getPublicKey() });
  }

  @UseGuards(VerifiedAuthGuard)
  @Post("/topup/initialize")
  async initializeTopup(@Body() dto: PaystackInitializeTopupDto, @Req() req: any) {
    const data = await this.paystackService.initializeTopup({
      userId: req.user?._id?.toString(),
      amount: dto.amount,
      currency: dto.currency,
    });
    return resOK(data);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get("/topup/verify/:reference")
  async verifyTopup(@Param("reference") reference: string, @Req() req: any) {
    const data = await this.paystackService.verifyTopup({
      userId: req.user?._id?.toString(),
      reference,
    });
    return resOK(data);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get("/transactions/:id")
  async getTx(@Param("id") id: string, @Req() req: any) {
    const tx = await this.paystackService.findTxById(id, req.user?._id?.toString());
    return resOK(tx);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get("/wallet/history")
  async walletHistory(@Req() req: any, @Query('limit') limit?: string) {
    const l = parseInt(limit || '20', 10);
    const userId = req.user?._id?.toString();
    const data = await this.paystackService.getWalletTopups(userId, isNaN(l) ? 20 : l);
    return resOK(data);
  }

  @Post("/webhook")
  async webhook(@Req() req: any, @Body() body: any) {
    const sig = (req.headers["x-paystack-signature"] || req.headers["X-Paystack-Signature"] || "").toString();
    const rawBody = (req as any).rawBody?.toString?.() || "";
    await this.paystackService.handleWebhook({ signature: sig, rawBody, body });
    return { ok: true };
  }

  @UseGuards(VerifiedAuthGuard)
  @Post("/withdraw")
  async withdraw(@Body() dto: PaystackWithdrawDto, @Req() req: any) {
    const data = await this.paystackService.withdrawToBank({
      userId: req.user?._id?.toString(),
      amount: dto.amount,
      accountNumber: dto.accountNumber,
      bankCode: dto.bankCode,
      currency: dto.currency,
      recipientType: dto.recipientType,
      name: dto.name,
      reason: dto.reason,
    });
    return resOK(data);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get("/banks")
  async banks(@Query("country") country?: string, @Query("currency") currency?: string) {
    const data = await this.paystackService.listBanks({ country, currency });
    return resOK(data);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get("/resolve")
  async resolve(
    @Query("accountNumber") accountNumber: string,
    @Query("bankCode") bankCode: string,
  ) {
    const data = await this.paystackService.resolveAccount({ accountNumber, bankCode });
    return resOK(data);
  }
}
