import { Body, Get, Post, Req, UseGuards } from '@nestjs/common';
import { V1Controller } from '../../core/common/v1-controller.decorator';
import { VerifiedAuthGuard } from '../../core/guards/verified.auth.guard';
import { VerificationService } from './verification.service';
import { resOK } from '../../core/utils/res.helpers';
import { AppConfigService } from '../app_config/app_config.service';

@V1Controller('verification')
export class VerificationController {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly appConfigService: AppConfigService,
  ) {}

  // Create a new verification request; body contains already-uploaded file URLs
  @UseGuards(VerifiedAuthGuard)
  @Post('/requests')
  async createRequest(
    @Req() req: any,
    @Body()
    body: {
      idImageUrl: string;
      selfieImageUrl: string;
      paymentReference?: string;
      paymentScreenshotUrl?: string;
      feePlan?: 'monthly' | 'six_months' | 'yearly';
    },
  ) {
    if (!body?.idImageUrl || !body?.selfieImageUrl) {
      throw new Error('idImageUrl and selfieImageUrl are required');
    }
    const config = await this.appConfigService.getConfig();

    const monthlyFee = Number((config as any)?.verificationFeeMonthly ?? 0) || 0;
    const sixMonthsFee = Number((config as any)?.verificationFeeSixMonths ?? 0) || 0;
    const legacyYearlyFee = Number((config as any)?.verificationFee ?? 0) || 0;
    const yearlyFee = Number((config as any)?.verificationFeeYearly ?? legacyYearlyFee) || 0;

    const availablePlans: Array<{ plan: 'monthly' | 'six_months' | 'yearly'; months: number; fee: number }> = [];
    if (monthlyFee > 0) availablePlans.push({ plan: 'monthly', months: 1, fee: monthlyFee });
    if (sixMonthsFee > 0) availablePlans.push({ plan: 'six_months', months: 6, fee: sixMonthsFee });
    if (yearlyFee > 0) availablePlans.push({ plan: 'yearly', months: 12, fee: yearlyFee });

    let selectedPlan: 'monthly' | 'six_months' | 'yearly' = 'yearly';
    let selectedMonths = 12;
    let selectedFee = yearlyFee;

    if (body?.feePlan === 'monthly') {
      selectedPlan = 'monthly';
      selectedMonths = 1;
      selectedFee = monthlyFee;
    } else if (body?.feePlan === 'six_months') {
      selectedPlan = 'six_months';
      selectedMonths = 6;
      selectedFee = sixMonthsFee;
    } else if (body?.feePlan === 'yearly') {
      selectedPlan = 'yearly';
      selectedMonths = 12;
      selectedFee = yearlyFee;
    } else {
      if (availablePlans.length === 1) {
        selectedPlan = availablePlans[0].plan;
        selectedMonths = availablePlans[0].months;
        selectedFee = availablePlans[0].fee;
      } else {
        selectedPlan = 'yearly';
        selectedMonths = 12;
        selectedFee = yearlyFee;
      }
      if (selectedFee <= 0 && legacyYearlyFee > 0) {
        selectedFee = legacyYearlyFee;
      }
    }

    const created = await this.verificationService.create({
      userId: req.user._id,
      idImageUrl: body.idImageUrl,
      selfieImageUrl: body.selfieImageUrl,
      paymentReference: body.paymentReference,
      paymentScreenshotUrl: body.paymentScreenshotUrl,
      status: 'pending',
      feePlan: selectedPlan,
      feeDurationMonths: selectedMonths,
      feeAtSubmission: selectedFee,
    });
    const doc = Array.isArray(created) ? created[0] : created;
    return resOK(doc);
  }

  // Get latest request for my account
  @UseGuards(VerifiedAuthGuard)
  @Get('/requests/my-latest')
  async myLatest(@Req() req: any) {
    const latest = await this.verificationService.latestForUser(req.user._id);
    return resOK(latest);
  }
}
