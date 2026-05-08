import { Body, Post, Req, UseGuards, UseInterceptors, UploadedFile } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { VerifiedAuthGuard } from "../../../core/guards/verified.auth.guard";
import { V1Controller } from "../../../core/common/v1-controller.decorator";
import { resOK } from "../../../core/utils/res.helpers";
import { StatusAiService } from "./status_ai.service";
import { StatusAiCaptionDto } from "./dto/status-ai-caption.dto";
import { StatusAiAnalyzeDto } from "./dto/status-ai-analyze.dto";
import { StatusAiSuggestionsDto } from "./dto/status-ai-suggestions.dto";

@UseGuards(VerifiedAuthGuard)
@V1Controller("status-ai")
export class StatusAiController {
  constructor(private readonly ai: StatusAiService) {}

  @Post("/caption")
  async caption(@Body() dto: StatusAiCaptionDto, @Req() _req: any) {
    const out = await this.ai.generateCaption({
      storyType: dto.storyType,
      text: dto.text,
      existingCaption: dto.existingCaption,
      mimeType: dto.mimeType,
    });
    return resOK(out);
  }

  @Post("/analyze")
  async analyze(@Body() dto: StatusAiAnalyzeDto, @Req() _req: any) {
    const out = await this.ai.analyze({
      storyType: dto.storyType,
      text: dto.text,
      caption: dto.caption,
      mimeType: dto.mimeType,
    });
    return resOK(out);
  }

  @Post("/suggestions")
  @UseInterceptors(FileInterceptor("file"))
  async suggestions(
    @Body() dto: StatusAiSuggestionsDto,
    @Req() _req: any,
    @UploadedFile() file?: Express.Multer.File
  ) {
    const out = await this.ai.suggestions({
      storyType: dto.storyType,
      text: dto.text,
      caption: dto.caption,
      mimeType: dto.mimeType,
      file,
    });
    return resOK(out);
  }
}

