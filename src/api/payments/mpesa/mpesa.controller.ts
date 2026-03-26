import { Body, Get, Param, Post, Req, UseGuards, Logger, Query } from "@nestjs/common";
import { V1Controller } from "../../../core/common/v1-controller.decorator";
import { MpesaService } from "./mpesa.service";
import { InitiateStkDto } from "./dto/initiate-stk.dto";
import { resOK } from "../../../core/utils/res.helpers";
import { VerifiedAuthGuard } from "../../../core/guards/verified.auth.guard";
import { B2CRequestDto } from "./dto/b2c-request.dto";
import { ReverseDto } from "./dto/reverse.dto";
import { C2BSimulateDto } from "./dto/c2b-simulate.dto";
import { WalletWithdrawDto } from "./dto/wallet-withdraw.dto";

@V1Controller("payments/mpesa")
export class MpesaController {
  private readonly logger = new Logger(MpesaController.name);
  constructor(private readonly mpesaService: MpesaService) {}

  @UseGuards(VerifiedAuthGuard)
  @Post("/stk/initiate")
  async initiate(@Body() dto: InitiateStkDto, @Req() req: any) {
    const result = await this.mpesaService.initiateStkPush({
      amount: dto.amount,
      phone: dto.phone,
      accountReference: dto.accountReference,
      description: dto.description,
      userId: req.user?._id?.toString(),
    });
    return resOK(result);
  }

  // Safaricom callback - must be publicly accessible
  @Post("/stk/callback")
  async stkCallback(@Body() body: any) {
    try {
      try {
        const keys = body && typeof body === 'object' ? Object.keys(body) : [];
        this.logger.log(`STK callback hit. Top-level keys: ${JSON.stringify(keys)}`);
        const bodyKeys = body?.Body ? Object.keys(body.Body) : [];
        if (bodyKeys.length) this.logger.log(`STK callback Body keys: ${JSON.stringify(bodyKeys)}`);
      } catch {}

      const tx = await this.mpesaService.handleStkCallback(body);
      try {
        this.logger.log(`STK callback processed. Tx=${tx?._id || 'null'}, status=${tx?.status || 'n/a'}`);
      } catch {}
    } catch (e: any) {
      this.logger.error(`stkCallback error: ${e?.message}`);
    }
    // Respond 200 OK per Safaricom expectations
    return { ResultCode: 0, ResultDesc: "Accepted" };
  }

  @UseGuards(VerifiedAuthGuard)
  @Get("/transactions/:id")
  async getTx(@Param("id") id: string) {
    const tx = await this.mpesaService.findTxById(id);
    return resOK(tx);
  }

  // Wallet history (recent top-ups) for the authenticated user
  @UseGuards(VerifiedAuthGuard)
  @Get("/wallet/history")
  async walletHistory(@Req() req: any, @Query('limit') limit?: string) {
    const l = parseInt(limit || '20', 10);
    const userId = req.user?._id?.toString();
    const data = await this.mpesaService.getWalletTopups(userId, isNaN(l) ? 20 : l);
    return resOK(data);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get("/query/:checkoutRequestId")
  async query(@Param("checkoutRequestId") checkoutRequestId: string) {
    const data = await this.mpesaService.queryStkPushStatus(checkoutRequestId);
    return resOK(data);
  }

  // ===== C2B (Register/Validation/Confirmation) =====
  @UseGuards(VerifiedAuthGuard)
  @Post("/c2b/register")
  async registerC2B() {
    const data = await this.mpesaService.registerC2BUrls();
    return resOK(data);
  }

  @Post("/c2b/validation")
  async c2bValidation(@Body() body: any) {
    return await this.mpesaService.handleC2BValidation(body);
  }

  @Post("/c2b/confirmation")
  async c2bConfirmation(@Body() body: any) {
    return await this.mpesaService.handleC2BConfirmation(body);
  }

  @UseGuards(VerifiedAuthGuard)
  @Post("/c2b/simulate")
  async c2bSimulate(@Body() dto: C2BSimulateDto) {
    const data = await this.mpesaService.simulateC2B(dto);
    return resOK(data);
  }

  // ===== B2C (Initiate and callbacks) =====
  @UseGuards(VerifiedAuthGuard)
  @Post("/b2c/initiate")
  async b2cInitiate(@Body() dto: B2CRequestDto, @Req() req: any) {
    const data = await this.mpesaService.initiateB2C({ ...dto, userId: req.user?._id?.toString() });
    return resOK(data);
  }

  // Wallet withdrawal using B2C and deducting from in-app balance
  @UseGuards(VerifiedAuthGuard)
  @Post("/wallet/withdraw")
  async walletWithdraw(@Body() dto: WalletWithdrawDto, @Req() req: any) {
    const data = await this.mpesaService.withdrawFromWallet({
      userId: req.user?._id?.toString(),
      amount: dto.amount,
      phone: dto.phone,
      remarks: dto.remarks,
      occasion: "Withdrawal",
    });
    return resOK(data);
  }

  @Post("/b2c/result")
  async b2cResult(@Body() body: any) {
    await this.mpesaService.handleB2CResult(body);
    return { ResultCode: 0, ResultDesc: "Accepted" };
  }

  @Post("/b2c/timeout")
  async b2cTimeout(@Body() body: any) {
    await this.mpesaService.handleB2CTimeout(body);
    return { ResultCode: 0, ResultDesc: "Accepted" };
  }

  // ===== Status & Reversal =====
  @UseGuards(VerifiedAuthGuard)
  @Get("/status/:transactionId")
  async status(@Param("transactionId") transactionId: string) {
    const data = await this.mpesaService.transactionStatus(transactionId);
    return resOK(data);
  }

  @UseGuards(VerifiedAuthGuard)
  @Post("/reversal")
  async reversal(@Body() dto: ReverseDto) {
    const data = await this.mpesaService.reverseTransaction(dto);
    return resOK(data);
  }
}
