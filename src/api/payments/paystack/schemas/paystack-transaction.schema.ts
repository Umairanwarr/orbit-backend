import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type PaystackTransactionDocument = HydratedDocument<PaystackTransaction>;

export type PaystackTransactionStatus = "pending" | "success" | "failed";

export type PaystackTransactionType = "TOPUP" | "TRANSFER";

@Schema({ timestamps: true, collection: "paystack_transactions" })
export class PaystackTransaction {
  @Prop({ type: String, enum: ["TOPUP", "TRANSFER"], required: true, index: true })
  type: PaystackTransactionType;

  @Prop({ type: String, enum: ["pending", "success", "failed"], default: "pending", index: true })
  status: PaystackTransactionStatus;

  @Prop({ type: Number, required: true })
  amount: number; // major unit e.g. 100.00

  @Prop({ type: Number, required: true })
  amountBase: number; // minor unit e.g. 10000

  @Prop({ type: String, default: "NGN" })
  currency: string;

  @Prop({ type: String, required: false, index: true })
  userId?: string;

  @Prop({ type: String, required: false, index: true, unique: true, sparse: true })
  reference?: string;

  @Prop({ type: String, required: false })
  authorizationUrl?: string;

  @Prop({ type: String, required: false })
  accessCode?: string;

  @Prop({ type: Date, required: false })
  paidAt?: Date;

  @Prop({ type: String, required: false })
  channel?: string;

  @Prop({ type: String, required: false })
  gatewayResponse?: string;

  @Prop({ type: Object, required: false })
  rawInitialize?: any;

  @Prop({ type: Object, required: false })
  rawVerify?: any;

  @Prop({ type: String, required: false })
  errorMessage?: string;

  // Wallet top-ups: mark when wallet has been credited to avoid double-credit
  @Prop({ type: Date, required: false })
  walletCreditedAt?: Date;

  // Wallet withdrawals: mark when wallet has been debited and refunded if initiation fails
  @Prop({ type: Date, required: false })
  walletDebitedAt?: Date;

  @Prop({ type: Date, required: false })
  walletDebitRefundedAt?: Date;

  @Prop({ type: String, required: false })
  recipientCode?: string;

  @Prop({ type: String, required: false })
  transferCode?: string;
}

export const PaystackTransactionSchema = SchemaFactory.createForClass(PaystackTransaction);
