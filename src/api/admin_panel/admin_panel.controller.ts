import {
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { AdminPanelService } from "./admin_panel.service";
import { V1Controller } from "../../core/common/v1-controller.decorator";
import { IsSuperAdminGuard } from "../../core/guards/is.admin.or.super.guard";
import { UpdateConfigDto } from "./dto/update_config_dto";
import { resOK } from "../../core/utils/res.helpers";
import { MongoIdDto } from "../../core/common/dto/mongo.id.dto";
import { BanToDto, CreateNewVersionDto, GetVersionDto } from "./dto/admin_dto";
import { CreateAdminNotificationDto } from "../admin_notification/dto/create-admin_notification.dto";
import { MongoRoomIdDto } from "../../core/common/dto/mongo.room.id.dto";
import { imageFileInterceptor } from "../../core/utils/upload_interceptors";
import { UserRole } from "src/core/utils/enums";

@UseGuards(IsSuperAdminGuard)
@V1Controller("admin-panel")
export class AdminPanelController {
  constructor(private readonly adminPanelService: AdminPanelService) {}

  @Patch("/config")
  async updateConfig(@Req() req: any, @Body() dto: UpdateConfigDto) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.updateConfig(dto));
  }

  @Get("/config")
  async getConfig(@Req() req: any) {
    return resOK(await this.adminPanelService.getAppConfig());
  }

  @Patch("/privacy-policy")
  async updatePrivacyPolicy(
    @Req() req: any,
    @Body() body: { privacyPolicyText: string },
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(
      await this.adminPanelService.updatePrivacyPolicy(body.privacyPolicyText),
    );
  }

  @Get("/privacy-policy")
  async getPrivacyPolicy(@Req() req: any) {
    return resOK(await this.adminPanelService.getPrivacyPolicy());
  }

  @Patch("/admin-password")
  async updateAdminPassword(
    @Req() req: any,
    @Body() body: { newPassword: string },
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(
      await this.adminPanelService.updateAdminPassword(body.newPassword),
    );
  }

  @Patch("/versions")
  async setNewVersion(@Req() req: any, @Body() dto: CreateNewVersionDto) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.setNewVersion(dto));
  }

  @Post("/notifications")
  @UseInterceptors(imageFileInterceptor)
  async createNotifications(
    @Req() req: any,
    @Body() dto: CreateAdminNotificationDto,
    @UploadedFile() file?: any,
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    if (file) {
      dto.imageBuffer = file.buffer;
    }
    return resOK(await this.adminPanelService.createNotification(dto));
  }

  @Get("/notifications")
  async getNotifications() {
    return resOK(await this.adminPanelService.getNotification());
  }

  // Live watermark management
  @Post("/live-watermark")
  @UseInterceptors(imageFileInterceptor)
  async setLiveWatermark(
    @Req() req: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    if (!file) {
      throw new Error("Watermark image file is required");
    }
    const url = await this.adminPanelService.setLiveWatermark(file);
    return resOK({ liveWatermarkUrl: url });
  }

  @Delete("/live-watermark")
  async deleteLiveWatermark(@Req() req: any) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    const url = await this.adminPanelService.deleteLiveWatermark();
    return resOK({ liveWatermarkUrl: url });
  }

  @Get("/users/log")
  async getUsersLog() {
    return resOK(await this.adminPanelService.getUsersLog());
  }

  @Get("/versions/:platform")
  async getVersionDashboard(@Param() platform: GetVersionDto) {
    return resOK(await this.adminPanelService.getVersions(platform));
  }

  @Delete("/versions/:id")
  async deleteVersion(@Req() req: any, @Param() id: MongoIdDto) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.deleteVersion(id));
  }

  @Get("/countries")
  async getCountryInfo() {
    return resOK(await this.adminPanelService.getCountriesInfo());
  }

  @Get("/user/info/:id")
  async getUserInfo(@Param() dto: MongoIdDto) {
    return resOK(await this.adminPanelService.getUserInfo(dto));
  }

  @Get("/user/info/:id/chats")
  async getUserChats(@Param() dto: MongoIdDto, @Query() filter: Object) {
    return resOK(await this.adminPanelService.getUserChats(dto.id, filter));
  }

  @Get("/user/info/:id/chats/:roomId")
  async getUserChatsMessages(
    @Param() roomIdDto: MongoRoomIdDto,
    @Query() filter: Object,
    @Param() userId: MongoIdDto,
  ) {
    return resOK(
      await this.adminPanelService.getUserChatsMessages(
        userId.id,
        roomIdDto.roomId,
        filter,
      ),
    );
  }

  @Patch("/user/info/:id")
  async updateUserInfo(
    @Req() req: any,
    @Param() dto: MongoIdDto,
    @Body() body: object,
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.updateUserInfo(dto.id, body));
  }

  @Patch("/user/role/:id")
  async updateUserRole(
    @Req() req: any,
    @Param() dto: MongoIdDto,
    @Body() body: { roles: UserRole[] }, // Expect an array of roles from frontend
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.updateUserRole(dto.id, body));
  }

  // Explicit endpoints to grant/revoke Admin role for easier client integration
  @Patch("/user/admin/grant/:id")
  async grantAdminRole(@Req() req: any, @Param() dto: MongoIdDto) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.grantAdminRole(dto.id));
  }

  @Patch("/user/admin/revoke/:id")
  async revokeAdminRole(@Req() req: any, @Param() dto: MongoIdDto) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.revokeAdminRole(dto.id));
  }

  @Patch("/user/ban/:id")
  async banUser(
    @Param("id") id: string,
    @Body() body: { type: "general" | "message" | "live"; until: Date },
  ) {
    return resOK(await this.adminPanelService.banUser(id, body));
  }

  @Patch("/user/unban/:id")
  async unbanUser(
    @Param("id") id: string,
    @Body() body: { type: "general" | "message" | "live" },
  ) {
    return resOK(await this.adminPanelService.unbanUser(id, body));
  }

  @Patch("/drivers/:id/ride-ban")
  async banDriverFromRide(
    @Req() req: any,
    @Param() dto: MongoIdDto,
    @Body() body: { reason: string },
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.banDriverFromRide(dto.id, body));
  }

  @Patch("/drivers/:id/ride-unban")
  async unbanDriverFromRide(@Req() req: any, @Param() dto: MongoIdDto) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.unbanDriverFromRide(dto.id));
  }

  @Patch("/user/verify/:id")
  async verifyUser(@Param("id") id: string) {
    return resOK(await this.adminPanelService.verifyUser(id));
  }

  @Patch("/user/unverify/:id")
  async unverifyUser(@Param("id") id: string) {
    return resOK(await this.adminPanelService.unverifyUser(id));
  }

  @Get("/users")
  async getUsers(@Query() dto: Object) {
    return resOK(await this.adminPanelService.getUsers(dto));
  }

  @Post("/login")
  async login(@Req() req: any) {
    return resOK(await this.adminPanelService.login(req["isViewer"]));
  }

  @Get("/dashboard")
  async getDashboard() {
    return resOK(await this.adminPanelService.getDashboard());
  }

  @Get("/users/reports")
  async getUserReports(@Query() filter: Object) {
    return resOK(await this.adminPanelService.getUserReports(filter));
  }

  @Get("/marketplace/listings/reports")
  async getMarketplaceListingReports(@Query() filter: Object) {
    return resOK(
      await this.adminPanelService.getMarketplaceListingReports(filter),
    );
  }

  @Post("/marketplace/listings/reports/:id/ignore")
  async ignoreMarketplaceListingReport(
    @Req() req: any,
    @Param() dto: MongoIdDto,
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(
      await this.adminPanelService.ignoreMarketplaceListingReport(
        dto.id,
        req.user?._id,
      ),
    );
  }

  @Post("/marketplace/listings/reports/:id/remove")
  async removeMarketplaceListingByReport(
    @Req() req: any,
    @Param() dto: MongoIdDto,
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(
      await this.adminPanelService.removeMarketplaceListingByReport(
        dto.id,
        req.user?._id,
      ),
    );
  }

  @Get("/marketplace/listings/sold-out")
  async getMarketplaceSoldOutListings(@Query() filter: Object) {
    return resOK(
      await this.adminPanelService.getMarketplaceSoldOutListings(filter),
    );
  }

  @Patch("/marketplace/listings/:id/release-payment")
  async releaseMarketplaceSoldPayment(
    @Req() req: any,
    @Param() dto: MongoIdDto,
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(
      await this.adminPanelService.releaseMarketplaceSoldPayment(
        dto.id,
        req.user?._id,
      ),
    );
  }

  @Delete("/users/reports/:id")
  async deleteReport(@Req() req: any, @Param() dto: MongoIdDto) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.deleteReport(dto.id));
  }

  @Get("/user/info/:id/groups")
  async getUserGroups(@Param() dto: MongoIdDto, @Query() filter: Object) {
    return resOK(await this.adminPanelService.getUserGroups(dto.id, filter));
  }

  @Delete("/groups/:id")
  async deleteGroup(@Req() req: any, @Param() dto: MongoIdDto) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.deleteGroup(dto.id));
  }

  @Get("/groups-channels")
  async getGroupsChannels(@Query() filter: Object) {
    return resOK(await this.adminPanelService.getGroupsChannels(filter));
  }

  @Delete("/groups-channels/:id")
  async deleteGroupsChannels(@Req() req: any, @Param() dto: MongoIdDto) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.deleteGroupsChannels(dto.id));
  }

  @Get("/groups/:id/members")
  async getGroupMembers(@Param() dto: MongoIdDto, @Query() filter: Object) {
    return resOK(await this.adminPanelService.getGroupMembers(dto.id, filter));
  }

  @Get("/user/info/:id/stories")
  async getUserStories(@Param() dto: MongoIdDto, @Query() filter: Object) {
    return resOK(await this.adminPanelService.getUserStories(dto.id, filter));
  }

  @Delete("/stories/:id")
  async deleteStory(@Req() req: any, @Param() dto: MongoIdDto) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.deleteStory(dto.id));
  }

  // Live Categories Management
  @Get("/live-categories")
  async getLiveCategories() {
    return resOK(await this.adminPanelService.getLiveCategories());
  }

  @Post("/live-categories")
  async createLiveCategory(
    @Req() req: any,
    @Body() body: { name: string; description?: string; isActive?: boolean },
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.createLiveCategory(body));
  }

  @Patch("/live-categories/:id")
  async updateLiveCategory(
    @Req() req: any,
    @Param() dto: MongoIdDto,
    @Body() body: { name?: string; description?: string; isActive?: boolean },
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.updateLiveCategory(dto.id, body));
  }

  @Delete("/live-categories/:id")
  async deleteLiveCategory(@Req() req: any, @Param() dto: MongoIdDto) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.deleteLiveCategory(dto.id));
  }

  // Gift Management Endpoints
  @Get("/gifts")
  async getGifts(@Query() filter: Object) {
    return resOK(await this.adminPanelService.getGifts(filter));
  }

  @Get("/gifts/:id")
  async getGiftById(@Param() dto: MongoIdDto) {
    return resOK(await this.adminPanelService.getGiftById(dto.id));
  }

  @Post("/gifts")
  @UseInterceptors(imageFileInterceptor)
  async createGift(
    @Req() req: any,
    @Body()
    data: {
      name: string;
      description?: string;
      price: number;
      isActive?: boolean;
    },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.createGift(data, file));
  }

  @Patch("/gifts/:id")
  @UseInterceptors(imageFileInterceptor)
  async updateGift(
    @Req() req: any,
    @Param() dto: MongoIdDto,
    @Body()
    data: {
      name?: string;
      description?: string;
      price?: number;
      isActive?: boolean;
    },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.updateGift(dto.id, data, file));
  }

  @Delete("/gifts/:id")
  async deleteGift(@Req() req: any, @Param() dto: MongoIdDto) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.deleteGift(dto.id));
  }

  // ================= Verification Applications =================
  @Get("/verification-applications")
  async getVerificationApplications(@Query() filter: Object) {
    return resOK(
      await this.adminPanelService.getVerificationApplications(filter),
    );
  }

  @Get("/verification-applications/:id")
  async getVerificationApplicationById(@Param() dto: MongoIdDto) {
    return resOK(
      await this.adminPanelService.getVerificationApplicationById(dto.id),
    );
  }

  @Patch("/verification-applications/:id/review")
  async reviewVerificationApplication(
    @Req() req: any,
    @Param() dto: MongoIdDto,
    @Body() body: { status: "approved" | "rejected"; note?: string },
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    // reviewerId is not bound to an admin user entity; use a placeholder or extend guard to attach user info if needed
    const reviewerId = "admin";
    return resOK(
      await this.adminPanelService.reviewVerificationApplication(
        dto.id,
        body,
        reviewerId,
      ),
    );
  }

  @Delete("/verification-applications/:id")
  async deleteVerificationApplication(
    @Req() req: any,
    @Param() dto: MongoIdDto,
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(
      await this.adminPanelService.deleteVerificationApplication(dto.id),
    );
  }

  // ================= Ads Management =================
  @Get("/ads")
  async getAds(@Query() filter: Object) {
    return resOK(await this.adminPanelService.getAds(filter));
  }

  @Get("/ads/:id")
  async getAdById(@Param() dto: MongoIdDto) {
    return resOK(await this.adminPanelService.getAdById(dto.id));
  }

  @Patch("/ads/:id/review")
  async reviewAd(
    @Req() req: any,
    @Param() dto: MongoIdDto,
    @Body() body: { status: "approved" | "rejected"; note?: string },
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    const reviewerId = "admin";
    return resOK(
      await this.adminPanelService.reviewAd(dto.id, body, reviewerId),
    );
  }

  @Delete("/ads/:id")
  async deleteAd(@Req() req: any, @Param() dto: MongoIdDto) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.deleteAd(dto.id));
  }

  // ================= Music Content =================
  @Get("/music")
  async getMusic(@Query() filter: Object) {
    return resOK(await this.adminPanelService.getMusic(filter));
  }

  @Delete("/music/:id")
  async deleteMusic(@Req() req: any, @Param() dto: MongoIdDto) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.deleteMusic(dto.id));
  }

  @Get("/music/reports")
  async getMusicReports(@Query() filter: Object) {
    return resOK(await this.adminPanelService.getMusicReports(filter));
  }

  // ================= Articles Content =================
  @Get("/articles")
  async getArticles(@Query() filter: Object) {
    return resOK(await this.adminPanelService.getArticles(filter));
  }

  @Delete("/articles/:id")
  async deleteArticle(@Req() req: any, @Param() dto: MongoIdDto) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.deleteArticle(dto.id));
  }

  @Get("/articles/reports")
  async getArticleReports(@Query() filter: Object) {
    return resOK(await this.adminPanelService.getArticleReports(filter));
  }

  // ================= Driver Applications =================
  @Get("/driver-applications")
  async getDriverApplications(@Query() filter: Object) {
    return resOK(await this.adminPanelService.getDriverApplications(filter));
  }

  @Get("/driver-applications/:id")
  async getDriverApplicationById(@Param() dto: MongoIdDto) {
    return resOK(await this.adminPanelService.getDriverApplicationById(dto.id));
  }

  @Patch("/driver-applications/:id/review")
  async reviewDriverApplication(
    @Req() req: any,
    @Param() dto: MongoIdDto,
    @Body() body: { status: "approved" | "rejected"; note?: string },
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    const reviewerId = "admin";
    return resOK(
      await this.adminPanelService.reviewDriverApplication(
        dto.id,
        body,
        reviewerId,
      ),
    );
  }

  // ================= Seller Applications =================
  @Get("/seller-applications")
  async getSellerApplications(@Query() filter: Object) {
    return resOK(await this.adminPanelService.getSellerApplications(filter));
  }

  @Get("/seller-applications/:id")
  async getSellerApplicationById(@Param() dto: MongoIdDto) {
    return resOK(await this.adminPanelService.getSellerApplicationById(dto.id));
  }

  @Patch("/seller-applications/:id/review")
  async reviewSellerApplication(
    @Req() req: any,
    @Param() dto: MongoIdDto,
    @Body() body: { status: "approved" | "rejected"; note?: string },
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    const reviewerId = "admin";
    return resOK(
      await this.adminPanelService.reviewSellerApplication(
        dto.id,
        body,
        reviewerId,
      ),
    );
  }

  @Delete("/seller-applications/:id")
  async deleteSellerApplication(@Req() req: any, @Param() dto: MongoIdDto) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    return resOK(await this.adminPanelService.deleteSellerApplication(dto.id));
  }

  // ================= Withdraw Requests =================
  @Get("/withdraw-requests")
  async getWithdrawRequests(@Query() filter: Object) {
    return resOK(await this.adminPanelService.getWithdrawRequests(filter));
  }

  @Get("/withdraw-requests/:id")
  async getWithdrawRequestById(@Param() dto: MongoIdDto) {
    return resOK(await this.adminPanelService.getWithdrawRequestById(dto.id));
  }

  @Patch("/withdraw-requests/:id/review")
  async reviewWithdrawRequest(
    @Req() req: any,
    @Param() dto: MongoIdDto,
    @Body() body: { status: "approved" | "rejected"; note?: string },
  ) {
    if (req["isViewer"]) {
      return resOK("YOU ARE VIEWER !!!");
    }
    const reviewerId = "admin";
    return resOK(
      await this.adminPanelService.reviewWithdrawRequest(
        dto.id,
        body,
        reviewerId,
      ),
    );
  }

  // ================= Emergency Contacts =================
  @Get("/emergency-contacts")
  async getEmergencyContacts(@Query() filter: Object) {
    return resOK(await this.adminPanelService.getEmergencyContacts(filter));
  }
}
