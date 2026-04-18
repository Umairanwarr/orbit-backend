import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  WalletTransfer,
  WalletTransferDocument,
} from "./wallet-transfer.schema";
import { IAppConfig } from "src/api/app_config/entities/app_config.entity";
import { IUser } from "src/api/user_modules/user/entities/user.entity";
// Import your AppConfig and User models appropriately

@Injectable()
export class WalletService {
  constructor(
    @InjectModel(WalletTransfer.name)
    private readonly transferModel: Model<WalletTransferDocument>,
    @InjectModel("User") private readonly userModel: Model<IUser>,
    @InjectModel("AppConfig") private readonly configModel: Model<IAppConfig>,
  ) {}

  // --- 1. Send Money (Put into Escrow) ---
  async sendMoney(senderId: string, receiverId: string, amount: number) {
    if (senderId === receiverId)
      throw new BadRequestException("Cannot send money to yourself");

    // 1. Fetch Config to get Global Commission (Feature 4)
    const config = await this.configModel.findOne();
    const commissionPercent = config?.transactionCommissionPercent || 0;

    // Calculate fees
    const commissionAmount = (amount * commissionPercent) / 100;
    const totalDeduction = amount + commissionAmount;

    // 2. Safely deduct from Sender ONLY if they have enough
    const sender = await this.userModel.findOneAndUpdate(
      { _id: senderId, balance: { $gte: totalDeduction } },
      { $inc: { balance: -totalDeduction } },
      { new: true },
    );

    if (!sender) {
      throw new BadRequestException(
        "Insufficient balance to cover amount and commission",
      );
    }

    // 3. Create Transfer in ESCROW status
    const transfer = await this.transferModel.create({
      senderId,
      receiverId,
      amount,
      commission: commissionAmount,
      status: "ESCROW",
      // Set expiration exactly 5 minutes from now
      escrowExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    return {
      success: true,
      message:
        "Transfer initiated. You have 5 minutes to reverse this transaction.",
      transferId: transfer._id,
      newBalance: sender.balance,
    };
  }

  // --- 2. Reverse Money (Within 5 Mins) ---
  async reverseTransfer(senderId: string, transferId: string) {
    const transfer = await this.transferModel.findOne({
      _id: transferId,
      senderId,
    });

    if (!transfer) throw new NotFoundException("Transfer not found");
    if (transfer.status !== "ESCROW")
      throw new BadRequestException("Transaction is no longer pending");

    // Check if 5 minutes have passed
    if (new Date() > transfer.escrowExpiresAt) {
      throw new BadRequestException("The 5-minute reversal window has expired");
    }

    // 1. Mark as reversed
    transfer.status = "REVERSED";
    await transfer.save();

    // 2. Refund the sender (Original amount + commission)
    const totalRefund = transfer.amount + transfer.commission;
    await this.userModel.findByIdAndUpdate(senderId, {
      $inc: { balance: totalRefund },
    });

    return { success: true, message: "Transfer successfully reversed" };
  }
}
