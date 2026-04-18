import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  Param,
  BadRequestException,
} from "@nestjs/common";
import { WalletService } from "./wallet.service";
import { VerifiedAuthGuard } from "src/core/guards/verified.auth.guard";
import { V1Controller } from "src/core/common/v1-controller.decorator";

@UseGuards(VerifiedAuthGuard)
@V1Controller("wallet") // Feel free to use your custom @V1Controller decorator here if you prefer
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post("send")
  async sendMoney(
    @Req() req: any,
    @Body("receiverId") receiverId: string,
    @Body("amount") amount: number,
  ) {
    if (!receiverId) {
      throw new BadRequestException("Receiver ID is required");
    }
    if (!amount || amount <= 0) {
      throw new BadRequestException("Amount must be greater than zero");
    }

    const data = await this.walletService.sendMoney(
      req.user._id,
      receiverId,
      amount,
    );

    return {
      success: true,
      data,
    };
  }

  @Post("transfer/:id/reverse")
  async reverseTransfer(@Req() req: any, @Param("id") transferId: string) {
    if (!transferId) {
      throw new BadRequestException("Transfer ID is required");
    }

    const data = await this.walletService.reverseTransfer(
      req.user._id,
      transferId,
    );

    return {
      success: true,
      data,
    };
  }
}
