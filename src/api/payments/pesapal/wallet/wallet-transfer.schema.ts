import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type WalletTransferDocument = WalletTransfer & Document;

export type TransferStatus = "ESCROW" | "COMPLETED" | "REVERSED";

@Schema({ timestamps: true, collection: "wallet_transfers" })
export class WalletTransfer {
  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  senderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  receiverId: Types.ObjectId;

  // The actual amount the receiver will get
  @Prop({ type: Number, required: true })
  amount: number;

  // Feature 4: The cut taken by Orbit (calculated at the time of transfer)
  @Prop({ type: Number, required: true })
  commission: number;

  @Prop({
    type: String,
    enum: ["ESCROW", "COMPLETED", "REVERSED"],
    default: "ESCROW",
    index: true,
  })
  status: TransferStatus;

  // Feature 3: The exact time the reversal window closes
  @Prop({ type: Date, required: true, index: true })
  escrowExpiresAt: Date;
}

export const WalletTransferSchema =
  SchemaFactory.createForClass(WalletTransfer);
