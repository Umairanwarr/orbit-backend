import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type PesapalTransactionDocument = HydratedDocument<PesapalTransaction>;

export type PesapalTransactionStatus =
  | "pending"
  | "success"
  | "failed"
  | "cancelled"
  | "reversed";

export type PesapalTransactionType = "TOPUP" | "WITHDRAWAL";

@Schema({ timestamps: true, collection: "pesapal_transactions" })
export class PesapalTransaction {
  @Prop({ type: String, enum: ["TOPUP", "WITHDRAWAL"], default: "TOPUP" })
  type: PesapalTransactionType;

  @Prop({
    type: String,
    enum: ["pending", "success", "failed", "cancelled", "reversed"],
    default: "pending",
    index: true,
  })
  status: PesapalTransactionStatus;

  @Prop({ type: Number, required: true })
  amount: number;

  @Prop({ type: String, default: "KES" })
  currency: string;

  @Prop({ type: String, required: false, index: true })
  userId?: string;

  @Prop({ type: String, required: false })
  description?: string;

  @Prop({ type: String, required: false })
  accountReference?: string;

  // PesaPal order tracking ID (returned after submitting an order)
  @Prop({ type: String, required: false, index: true })
  orderTrackingId?: string;

  // Our internal merchant reference (sent to PesaPal)
  @Prop({ type: String, required: false, index: true })
  merchantReference?: string;

  // The redirect URL where the user pays
  @Prop({ type: String, required: false })
  redirectUrl?: string;

  // PesaPal payment method used (e.g. "MpesaKE", "VisaMastercard")
  @Prop({ type: String, required: false })
  paymentMethod?: string;

  // PesaPal payment status description from their API
  @Prop({ type: String, required: false })
  paymentStatusDescription?: string;

  // PesaPal confirmation code (receipt)
  @Prop({ type: String, required: false })
  confirmationCode?: string;

  // Full raw callback/status payload from PesaPal
  @Prop({ type: Object, required: false })
  rawCallback?: any;

  // Full raw order submission response
  @Prop({ type: Object, required: false })
  rawOrderResponse?: any;

  @Prop({ type: String, required: false })
  errorMessage?: string;

  // Billing info
  @Prop({ type: String, required: false })
  email?: string;

  @Prop({ type: String, required: false })
  phone?: string;

  @Prop({ type: String, required: false })
  firstName?: string;

  @Prop({ type: String, required: false })
  lastName?: string;

  // Wallet top-up: idempotent credit flag
  @Prop({ type: Date, required: false })
  walletCreditedAt?: Date;

  // Wallet withdrawal: idempotent debit/refund flags
  @Prop({ type: Date, required: false })
  walletDebitedAt?: Date;

  @Prop({ type: Date, required: false })
  walletDebitRefundedAt?: Date;

  @Prop({ type: Date, required: false })
  paidAt?: Date;
}

export const PesapalTransactionSchema = SchemaFactory.createForClass(PesapalTransaction);
