import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  WalletTransfer,
  WalletTransferDocument,
} from "./wallet-transfer.schema";

@Injectable()
export class EscrowSettlementService {
  private readonly logger = new Logger(EscrowSettlementService.name);

  constructor(
    @InjectModel(WalletTransfer.name)
    private readonly transferModel: Model<WalletTransferDocument>,
    @InjectModel("User") private readonly userModel: Model<any>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async releaseExpiredEscrows() {
    this.logger.debug("Checking for expired wallet escrows...");

    // Find all transfers that are still pending, where the 5-minute expiration time is in the past
    const pendingTransfers = await this.transferModel.find({
      status: "ESCROW",
      escrowExpiresAt: { $lte: new Date() },
    });

    for (const transfer of pendingTransfers) {
      try {
        // 1. Credit the receiver's balance
        await this.userModel.findByIdAndUpdate(transfer.receiverId, {
          $inc: { balance: transfer.amount },
        });

        // 2. Mark the transfer as finalized
        transfer.status = "COMPLETED";
        await transfer.save();

        this.logger.log(
          `Released escrow for transfer ${transfer._id}. Credited receiver ${transfer.receiverId}.`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to release escrow for transfer ${transfer._id}`,
          error,
        );
      }
    }
  }
}
