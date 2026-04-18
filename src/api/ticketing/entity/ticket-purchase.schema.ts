import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type TicketPurchaseDocument = TicketPurchase & Document;

@Schema({ timestamps: true, collection: "ticket_purchases" })
export class TicketPurchase {
  @Prop({
    type: Types.ObjectId,
    ref: "TicketEvent",
    required: true,
    index: true,
  })
  eventId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  buyerId: Types.ObjectId;

  @Prop({ type: Number, required: true })
  amountPaid: number;

  // Feature 4: Recording the commission taken by Orbit for this specific ticket
  @Prop({ type: Number, required: true })
  commissionTaken: number;

  // This unique string is what the frontend will turn into a QR Code
  @Prop({ type: String, required: true, unique: true })
  ticketCode: string;

  @Prop({ type: String, enum: ["VALID", "USED", "REFUNDED"], default: "VALID" })
  status: string;
}

export const TicketPurchaseSchema =
  SchemaFactory.createForClass(TicketPurchase);
