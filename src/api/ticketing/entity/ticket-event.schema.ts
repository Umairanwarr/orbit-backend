import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type TicketEventDocument = TicketEvent & Document;

@Schema({ timestamps: true, collection: "ticket_events" })
export class TicketEvent {
  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: false })
  description: string;

  @Prop({
    type: String,
    enum: ["TRANSPORT", "SPORTS", "EVENT"],
    required: true,
    index: true,
  })
  eventType: string;

  @Prop({ type: Number, required: true })
  price: number;

  @Prop({ type: Number, required: true })
  totalCapacity: number;

  @Prop({ type: Number, required: true })
  availableSeats: number;

  @Prop({ type: Date, required: true })
  eventDate: Date;

  @Prop({ type: String, required: true })
  region: string;

  // The Admin or Organizer who created this event
  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  creatorId: Types.ObjectId;
}

export const TicketEventSchema = SchemaFactory.createForClass(TicketEvent);
