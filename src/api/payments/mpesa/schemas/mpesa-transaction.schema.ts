import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type MpesaTransactionDocument = HydratedDocument<MpesaTransaction>;

export type MpesaTransactionStatus =
  | "pending"
  | "success"
  | "failed"
  | "cancelled"
  | "timeout";

export type MpesaTransactionType = "STK" | "C2B" | "B2C";

@Schema({ timestamps: true, collection: "mpesa_transactions" })
export class MpesaTransaction {
  @Prop({ type: String, enum: ["STK", "C2B", "B2C"], default: "STK" })
  type: MpesaTransactionType;

  @Prop({
    type: String,
    enum: ["pending", "success", "failed", "cancelled", "timeout"],
    default: "pending",
    index: true,
  })
  status: MpesaTransactionStatus;

  @Prop({ type: Number })
  amount: number;

  @Prop({ type: String })
  phone: string; // 2547XXXXXXXX

  @Prop({ type: String, required: false })
  accountReference?: string;

  @Prop({ type: String, required: false })
  description?: string;

  @Prop({ type: String, required: false })
  userId?: string;

  @Prop({ type: String, index: true })
  checkoutRequestId?: string;

  @Prop({ type: String })
  merchantRequestId?: string;

  @Prop({ type: Number, required: false })
  resultCode?: number;

  @Prop({ type: String, required: false })
  resultDesc?: string;

  @Prop({ type: String, required: false })
  mpesaReceiptNumber?: string;

  @Prop({ type: Number, required: false })
  transactionDate?: number; // YYYYMMDDHHMMSS

  // For B2C flows and status queries
  @Prop({ type: String, required: false, index: true })
  conversationId?: string;

  @Prop({ type: String, required: false, index: true })
  originatorConversationId?: string;

  @Prop({ type: String, required: false })
  transactionId?: string; // TransID / TransactionID

  @Prop({ type: Object, required: false })
  callbackMetadata?: any;

  @Prop({ type: Object, required: false })
  rawCallback?: any;

  @Prop({ type: String, required: false })
  errorMessage?: string;

  // For wallet top-ups: mark when we already credited the user's wallet to avoid double-credit
  @Prop({ type: Date, required: false })
  walletCreditedAt?: Date;

  // For wallet withdrawals (B2C): mark when we debited the user's wallet and if refunded on failure
  @Prop({ type: Date, required: false })
  walletDebitedAt?: Date;

  @Prop({ type: Date, required: false })
  walletDebitRefundedAt?: Date;

  @Prop({ type: String, required: false })
  debitUserId?: string;
}

export const MpesaTransactionSchema = SchemaFactory.createForClass(MpesaTransaction);
