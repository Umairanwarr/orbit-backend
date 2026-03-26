import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RecordingPurchase } from './schemas/recording_purchase.schema';

@Injectable()
export class LiveStreamPaymentsListener {
  private readonly logger = new Logger(LiveStreamPaymentsListener.name);
  constructor(
    @InjectModel(RecordingPurchase.name)
    private readonly purchaseModel: Model<RecordingPurchase>,
  ) { }

  /**
   * Handle PesaPal IPN callback events for recording purchases.
   * The PesaPal controller emits 'pesapal.ipn.callback' events
   * which are picked up here to update recording purchase status.
   *
   * NOTE: The primary verification path is through getRecordingAccess()
   * which self-heals by querying PesaPal transaction status directly.
   * This listener provides an additional update path via IPN webhooks.
   */
  @OnEvent('pesapal.ipn.callback')
  async onPesapalCallback(tx: any) {
    try {
      if (!tx) return;
      const orderTrackingId: string | undefined = tx?.orderTrackingId;
      const merchantReference: string | undefined = tx?.merchantReference;
      if (!orderTrackingId && !merchantReference) return;

      const update: any = {
        status: tx?.status,
        rawCallback: tx?.rawCallback,
        confirmationCode: tx?.confirmationCode,
      };

      // Match by orderTrackingId, fall back to merchantReference
      const filter: any = { $or: [] as any[] };
      if (orderTrackingId) filter.$or.push({ orderTrackingId });
      if (merchantReference) filter.$or.push({ merchantReference });

      const purchase = await this.purchaseModel.findOneAndUpdate(
        filter,
        update,
        { new: true },
      );

      if (!purchase) {
        // Fallback: correlate by accountReference (e.g., REC-<recordingId>) and userId
        const accountRef: string | undefined = tx?.accountReference;
        let recordingId: string | undefined;
        if (accountRef && accountRef.startsWith('REC-')) {
          recordingId = accountRef.substring(4);
        }
        if (recordingId && tx?.userId) {
          const fallbackFilter: any = {
            recordingId,
            userId: tx.userId,
            status: { $in: ['pending', 'failed', 'cancelled', 'timeout'] },
          };
          const fb = await this.purchaseModel.findOneAndUpdate(
            fallbackFilter,
            { ...update, orderTrackingId, merchantReference },
            { new: true, sort: { createdAt: -1 } },
          );
          if (fb) {
            this.logger.log(`Recording purchase (fallback) updated from PesaPal callback: ${fb._id} -> ${fb.status}`);
            return;
          }
        }
        this.logger.warn(`No matching recording purchase for PesaPal callback (tracking=${orderTrackingId}, merchant=${merchantReference})`);
        return;
      }
      this.logger.log(`Recording purchase updated from PesaPal callback: ${purchase._id} -> ${purchase.status}`);
    } catch (e: any) {
      this.logger.error(`onPesapalCallback error: ${e?.message}`);
    }
  }
}
