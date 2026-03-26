import {
  Body,
  BadRequestException,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { V1Controller } from '../../core/common/v1-controller.decorator';
import { MarketplaceListingsService } from './marketplace_listings.service';
import { MarketplaceListingReportService } from './marketplace_listing_report.service';
import { resOK } from '../../core/utils/res.helpers';
import { VerifiedAuthGuard } from '../../core/guards/verified.auth.guard';
import { IsSuperAdminGuard } from '../../core/guards/is.admin.or.super.guard';
import { FileInterceptor } from '@nestjs/platform-express';

@V1Controller('marketplace')
export class MarketplaceListingsController {
  constructor(
    private readonly service: MarketplaceListingsService,
    private readonly listingReportService: MarketplaceListingReportService,
  ) {}

  @Get('/categories')
  async categories() {
    return resOK(this.service.getCategories());
  }

  // =================== Drafts ===================
  @UseGuards(VerifiedAuthGuard)
  @Post('/listings/drafts')
  async saveDraft(@Req() req: any, @Body() body: any) {
    const doc = await this.service.upsertDraft(req.user._id, body);
    return resOK(doc);
  }

  // =================== Preview ===================
  @UseGuards(VerifiedAuthGuard)
  @Post('/listings/preview')
  async preview(@Req() req: any, @Body() body: any) {
    return resOK(await this.service.preview(req.user._id, body));
  }

  @UseGuards(VerifiedAuthGuard)
  @Post('/listings/preview/save')
  async savePreview(@Req() req: any, @Body() body: any) {
    const doc = await this.service.savePreview(req.user._id, body);
    return resOK(doc);
  }

  // =================== Publish ===================
  @UseGuards(VerifiedAuthGuard)
  @Post('/listings/publish')
  async publish(@Req() req: any, @Body() body: any) {
    const doc = await this.service.publish(req.user._id, body);
    return resOK(doc);
  }

  @UseGuards(VerifiedAuthGuard)
  @Patch('/listings/:id/hide')
  async hideListing(@Req() req: any, @Param('id') id: string) {
    const doc = await this.service.hideListing(req.user._id, id);
    return resOK(doc);
  }

  @UseGuards(VerifiedAuthGuard)
  @Patch('/listings/:id/unhide')
  async unhideListing(@Req() req: any, @Param('id') id: string) {
    const doc = await this.service.unhideListing(req.user._id, id);
    return resOK(doc);
  }

  @UseGuards(VerifiedAuthGuard)
  @Patch('/listings/:id/sold')
  async markSold(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { soldPrice?: number },
  ) {
    const doc = await this.service.markAsSold(req.user._id, id, body);
    return resOK(doc);
  }

  // =================== My Listings ===================
  @UseGuards(VerifiedAuthGuard)
  @Get('/listings/my')
  async myListings(@Req() req: any, @Query('status') status?: string) {
    const items = await this.service.myListings(req.user._id, status);
    return resOK(items);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get('/listings/my/analytics')
  async myAnalytics(@Req() req: any) {
    const data = await this.service.myAnalytics(req.user._id);
    return resOK(data);
  }

  @Get('/listings/public/:id')
  async getByIdPublic(@Param('id') id: string) {
    const doc = await this.service.getByIdPublic(id);
    return resOK(doc);
  }

  @Patch('/listings/public/:id/view')
  async incrementView(@Param('id') id: string) {
    const data = await this.service.incrementPublicView(id);
    return resOK(data);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get('/listings/:id/like')
  async getLikeState(@Req() req: any, @Param('id') id: string) {
    const data = await this.service.getLikeState(req.user._id, id);
    return resOK(data);
  }

  @UseGuards(VerifiedAuthGuard)
  @Post('/listings/:id/like')
  async toggleLike(@Req() req: any, @Param('id') id: string) {
    const data = await this.service.toggleLike(req.user._id, id);
    return resOK(data);
  }

  // =================== Public Feed ===================
  @Get('/listings/feed')
  async feed(
    @Query('category') category?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('condition') condition?: string,
  ) {
    const items = await this.service.feed({
      category,
      q,
      limit: limit ? Number(limit) : undefined,
      lat: lat != null && lat !== '' ? Number(lat) : undefined,
      lng: lng != null && lng !== '' ? Number(lng) : undefined,
      radiusKm:
        radiusKm != null && radiusKm !== '' ? Number(radiusKm) : undefined,
      minPrice: minPrice != null && minPrice !== '' ? Number(minPrice) : undefined,
      maxPrice: maxPrice != null && maxPrice !== '' ? Number(maxPrice) : undefined,
      condition: condition != null && condition.trim() !== '' ? condition.trim() : undefined,
    } as any);
    return resOK(items);
  }

  // =================== Featured Listings (must be before :id routes) ===================
  @Get('/listings/featured')
  async getFeaturedListings(@Query('limit') limit?: string) {
    const data = await this.service.getFeaturedListings(
      limit ? Number(limit) : 20,
    );
    return resOK(data);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get('/listings/my/promoted')
  async getMyPromotedListings(@Req() req: any) {
    const data = await this.service.getMyPromotedListings(req.user._id);
    return resOK(data);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get('/listings/:id')
  async getById(@Req() req: any, @Param('id') id: string) {
    const doc = await this.service.getByIdForUser(req.user._id, id);
    return resOK(doc);
  }

  @UseGuards(VerifiedAuthGuard)
  @Delete('/listings/:id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const res = await this.service.deleteForUser(req.user._id, id);
    return resOK(res);
  }

  @UseGuards(VerifiedAuthGuard)
  @Post('/listings/:id/report')
  async reportListing(
    @Req() req: any,
    @Param('id') id: string,
    @Body('content') content: string,
  ) {
    const listing = await this.service.findById(id);
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    if ((listing as any).userId?.toString() === req.user._id?.toString()) {
      throw new BadRequestException('You cannot report your own listing');
    }
    const report = await this.listingReportService.upsertUserReport({
      userId: req.user._id,
      listingId: id,
      content,
    });
    return resOK(report);
  }

  // =================== Media Upload ===================
  @UseGuards(VerifiedAuthGuard)
  @Post('/listings/media/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 500 * 1024 * 1024,
        fieldSize: 500 * 1024 * 1024,
        files: 1,
        fields: 20,
        parts: 50,
        headerPairs: 2000,
      },
      fileFilter: (req, file, callback) => {
        void req;
        callback(null, true);
      },
    }),
  )
  async uploadMedia(@UploadedFile() file: any, @Req() req: any) {
    const uploaded = await this.service.uploadMedia(req.user._id, file);
    return resOK(uploaded);
  }

  // =================== Manual expire (debug/admin) ===================
  @UseGuards(IsSuperAdminGuard)
  @Patch('/listings/expire-due')
  async expireDue() {
    const n = await this.service.expireDue();
    return resOK({ expired: n });
  }

  // =================== Reviews ===================
  @Get('/listings/:id/reviews')
  async getReviews(@Param('id') id: string) {
    const data = await this.service.getReviewsWithUsers(id);
    return resOK(data);
  }

  @UseGuards(VerifiedAuthGuard)
  @Post('/listings/:id/review')
  async submitReview(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { rating: number; text?: string },
  ) {
    if (!body.rating || body.rating < 1 || body.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }
    const data = await this.service.upsertReview(req.user._id, id, body.rating, body.text);
    return resOK(data);
  }

  @UseGuards(VerifiedAuthGuard)
  @Delete('/listings/:id/review')
  async deleteReview(@Req() req: any, @Param('id') id: string) {
    const data = await this.service.deleteReview(req.user._id, id);
    return resOK(data);
  }

  // =================== Promotion ===================
  @UseGuards(VerifiedAuthGuard)
  @Post('/listings/:id/promote')
  async promoteListing(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { plan: 'weekly' | 'monthly'; paidAmount: number },
  ) {
    if (!body.plan || !['weekly', 'monthly'].includes(body.plan)) {
      throw new BadRequestException('Plan must be weekly or monthly');
    }
    if (typeof body.paidAmount !== 'number' || body.paidAmount < 0) {
      throw new BadRequestException('Invalid paid amount');
    }
    const data = await this.service.promoteListing(
      req.user._id,
      id,
      body.plan,
      body.paidAmount,
    );
    return resOK(data);
  }

  @UseGuards(IsSuperAdminGuard)
  @Patch('/listings/promotions/expire')
  async expirePromotions() {
    const n = await this.service.expirePromotions();
    return resOK({ expired: n });
  }

  @UseGuards(IsSuperAdminGuard)
  @Delete('/listings/:id/promotion')
  async removePromotion(@Param('id') id: string) {
    const data = await this.service.removePromotion(id);
    return resOK(data);
  }

  @UseGuards(IsSuperAdminGuard)
  @Get('/listings/promotions/all')
  async getAllPromotedListings(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.service.getAllPromotedListings(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
    return resOK(data);
  }

  @UseGuards(IsSuperAdminGuard)
  @Get('/listings/promotions/published')
  async getPublishedListingsForPromotion() {
    const data = await this.service.getPublishedListingsForPromotion();
    return resOK(data);
  }
}
