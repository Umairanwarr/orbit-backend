import {
  Body,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  Logger,
} from "@nestjs/common";
import { V1Controller } from "../../../core/common/v1-controller.decorator";
import { PesapalService } from "./pesapal.service";
import { PesapalCheckoutDto } from "./dto/pesapal-checkout.dto";
import { resOK } from "../../../core/utils/res.helpers";
import { VerifiedAuthGuard } from "../../../core/guards/verified.auth.guard";
import { Response } from "express";
import { PesapalWithdrawDto } from "./dto/pesapal-withdraw.dto";

@V1Controller("payments/pesapal")
export class PesapalController {
  private readonly logger = new Logger(PesapalController.name);

  constructor(private readonly pesapalService: PesapalService) {}

  /**
   * POST /api/v1/payments/pesapal/checkout
   * Initiates a PesaPal payment order (wallet top-up).
   * Returns the redirect URL where the user completes payment.
   */
  @UseGuards(VerifiedAuthGuard)
  @Post("/checkout")
  async checkout(@Body() dto: PesapalCheckoutDto, @Req() req: any) {
    const result = await this.pesapalService.submitOrder({
      userId: req.user?._id?.toString(),
      amount: dto.amount,
      currency: dto.currency,
      description: dto.description || "Wallet top-up",
      email: dto.email,
      phone: dto.phone,
      firstName: dto.firstName,
      lastName: dto.lastName,
      accountReference: `WALLET-${Date.now()}`,
    });
    return resOK(result);
  }

  /**
   * GET /api/v1/payments/pesapal/ipn/callback
   * PesaPal IPN (webhook) callback endpoint.
   * PesaPal sends OrderTrackingId and OrderMerchantReference as query params.
   */
  @Get("/ipn/callback")
  async handleIpn(
    @Query("OrderTrackingId") orderTrackingId: string,
    @Query("OrderMerchantReference") merchantRef: string,
    @Res() res: Response,
  ) {
    try {
      this.logger.log(
        `PesaPal IPN hit: OrderTrackingId=${orderTrackingId}, MerchantRef=${merchantRef}`,
      );
      const result = await this.pesapalService.handleIpnCallback(
        orderTrackingId,
        merchantRef,
      );
      return res.status(HttpStatus.OK).json({
        orderTrackingId,
        orderMerchantReference: merchantRef,
        status: 200,
        message: "IPN handled successfully",
      });
    } catch (e: any) {
      this.logger.error(`PesaPal IPN error: ${e?.message}`);
      return res.status(HttpStatus.OK).json({
        orderTrackingId,
        status: 200,
        message: "IPN acknowledged",
      });
    }
  }

  /**
   * GET /api/v1/payments/pesapal/verify/:orderTrackingId
   * Verify a PesaPal transaction status (user-initiated).
   */
  @UseGuards(VerifiedAuthGuard)
  @Get("/verify/:orderTrackingId")
  async verify(
    @Param("orderTrackingId") orderTrackingId: string,
    @Req() req: any,
  ) {
    const data = await this.pesapalService.verifyTransaction({
      userId: req.user?._id?.toString(),
      orderTrackingId,
    });
    return resOK(data);
  }

  /**
   * GET /api/v1/payments/pesapal/transactions/:id
   * Get a specific transaction by ID.
   */
  @UseGuards(VerifiedAuthGuard)
  @Get("/transactions/:id")
  async getTx(@Param("id") id: string, @Req() req: any) {
    const tx = await this.pesapalService.findTxById(
      id,
      req.user?._id?.toString(),
    );
    return resOK(tx);
  }

  /**
   * GET /api/v1/payments/pesapal/wallet/history
   * Wallet top-up history for the authenticated user.
   */
  @UseGuards(VerifiedAuthGuard)
  @Get("/wallet/history")
  async walletHistory(@Req() req: any, @Query("limit") limit?: string) {
    const l = parseInt(limit || "20", 10);
    const userId = req.user?._id?.toString();
    const data = await this.pesapalService.getWalletTopups(
      userId,
      isNaN(l) ? 20 : l,
    );
    return resOK(data);
  }

  @UseGuards(VerifiedAuthGuard)
  @Post("/withdraw")
  async withdraw(@Body() dto: PesapalWithdrawDto, @Req() req: any) {
    const result = await this.pesapalService.requestWithdrawal(
      req.user?._id?.toString(),
      dto,
    );
    return resOK(result);
  }
}
