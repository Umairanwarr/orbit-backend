import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RecordingPurchaseStatus = 'pending' | 'success' | 'failed' | 'cancelled' | 'timeout';

@Schema({ timestamps: true, collection: 'recording_purchases' })
export class RecordingPurchase extends Document {
  @Prop({ required: true })
  recordingId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  amount: number; // in KES

  @Prop({ default: 'KES' })
  currency: string;

  @Prop({ type: String, enum: ['pending', 'success', 'failed', 'cancelled', 'timeout'], default: 'pending', index: true })
  status: RecordingPurchaseStatus;

  @Prop()
  checkoutRequestId?: string;

  @Prop()
  merchantRequestId?: string;

  @Prop()
  mpesaReceiptNumber?: string;

  @Prop()
  transactionDate?: number; // YYYYMMDDHHMMSS

  // PesaPal fields
  @Prop({ index: true })
  orderTrackingId?: string;

  @Prop()
  merchantReference?: string;

  @Prop()
  confirmationCode?: string;

  @Prop({ type: Object })
  callbackMetadata?: any;

  @Prop({ type: Object })
  rawCallback?: any;
}

export const RecordingPurchaseSchema = SchemaFactory.createForClass(RecordingPurchase);
