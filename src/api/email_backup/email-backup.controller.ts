import {
  Body,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { VerifiedAuthGuard } from "../../core/guards/verified.auth.guard";
import { V1Controller } from "../../core/common/v1-controller.decorator";
import { resOK } from "../../core/utils/res.helpers";
import { EmailBackupService } from "./email-backup.service";
import { UpdateEmailBackupSettingsDto } from "./dto/update-email-backup-settings.dto";
import { RestoreEmailBackupDto } from "./dto/restore-email-backup.dto";

@UseGuards(VerifiedAuthGuard)
@V1Controller("email-backup")
export class EmailBackupController {
  constructor(private readonly backups: EmailBackupService) {}

  @Get("/settings")
  async getSettings(@Req() req: any) {
    const userId = req.user?._id?.toString();
    return resOK(await this.backups.getSettings(userId));
  }

  @Post("/settings/update")
  async updateSettings(
    @Req() req: any,
    @Body() dto: UpdateEmailBackupSettingsDto,
  ) {
    const userId = req.user?._id?.toString();
    return resOK(await this.backups.upsertSettings(userId, dto));
  }

  @Post("/run")
  async runNow(@Req() req: any) {
    const userId = req.user?._id?.toString();
    return resOK(await this.backups.runBackupNow(userId, "manual"));
  }

  @Get("/history")
  async history(@Req() req: any, @Query("limit") limit?: string) {
    const userId = req.user?._id?.toString();
    const l = parseInt(limit || "20", 10);
    return resOK(await this.backups.listHistory(userId, isNaN(l) ? 20 : l));
  }

  // Restore from uploaded backup file + meta.json
  @Post("/restore")
  @UseInterceptors(FilesInterceptor("file", 2))
  async restore(
    @Req() req: any,
    @Body() dto: RestoreEmailBackupDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const userId = req.user?._id?.toString();
    const all = files || [];
    const bin = all.find((f) => f.originalname.endsWith(".bin")) || all[0];
    const metaFile = all.find((f) => f.originalname.endsWith(".meta.json"));
    if (!bin) throw new BadRequestException("Backup .bin file is required");
    if (!metaFile) throw new BadRequestException("Backup .meta.json is required");

    let meta: any = {};
    try {
      meta = JSON.parse(metaFile.buffer.toString("utf8"));
    } catch {
      throw new BadRequestException("Invalid meta.json");
    }

    const out = await this.backups.restoreFromUploadedBackup({
      userId,
      blob: bin.buffer,
      meta,
      encryptionSecret: dto.encryptionSecret,
    });
    return resOK(out);
  }
}

