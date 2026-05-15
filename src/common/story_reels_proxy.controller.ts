import { All, Controller, Req, Res, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { Request, Response } from "express";

class BaseStoryReelsProxyController {
  constructor(private readonly config: ConfigService) {}

  protected async proxy(
    req: Request,
    res: Response
  ): Promise<void> {
    const base = this.config
      .get<string>("REELS_STORY_SERVICE_BASE_URL", "")
      .replace(/\/+$/, "");
    if (!base) {
      throw new ServiceUnavailableException(
        "REELS_STORY_SERVICE_BASE_URL is not configured"
      );
    }

    const headers = { ...req.headers };
    delete headers.host;
    delete headers["content-length"];

    const contentType = String(req.headers["content-type"] ?? "");
    const isMultipart = contentType.includes("multipart/form-data");
    const hasBody = !["GET", "HEAD"].includes(req.method.toUpperCase());
    const response = await axios.request<ArrayBuffer>({
      method: req.method as any,
      url: `${base}${req.originalUrl}`,
      headers,
      data: hasBody ? (isMultipart ? req : req.body) : undefined,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      responseType: "arraybuffer",
      validateStatus: () => true,
    });

    for (const [key, value] of Object.entries(response.headers)) {
      if (
        ["connection", "content-length", "keep-alive", "transfer-encoding"].includes(
          key.toLowerCase()
        )
      ) {
        continue;
      }
      if (value !== undefined) {
        res.setHeader(key, value as any);
      }
    }

    res.status(response.status).send(Buffer.from(response.data));
  }
}

@Controller("api/v1/user-story")
export class StoryProxyController extends BaseStoryReelsProxyController {
  constructor(config: ConfigService) {
    super(config);
  }

  @All()
  async proxyRoot(@Req() req: Request, @Res() res: Response) {
    await this.proxy(req, res);
  }

  @All("*")
  async proxyAll(@Req() req: Request, @Res() res: Response) {
    await this.proxy(req, res);
  }
}

@Controller("api/v1/story-subscriptions")
export class StorySubscriptionsProxyController extends BaseStoryReelsProxyController {
  constructor(config: ConfigService) {
    super(config);
  }

  @All()
  async proxyRoot(@Req() req: Request, @Res() res: Response) {
    await this.proxy(req, res);
  }

  @All("*")
  async proxyAll(@Req() req: Request, @Res() res: Response) {
    await this.proxy(req, res);
  }
}

@Controller("api/v1/status-ai")
export class StatusAiProxyController extends BaseStoryReelsProxyController {
  constructor(config: ConfigService) {
    super(config);
  }

  @All()
  async proxyRoot(@Req() req: Request, @Res() res: Response) {
    await this.proxy(req, res);
  }

  @All("*")
  async proxyAll(@Req() req: Request, @Res() res: Response) {
    await this.proxy(req, res);
  }
}

@Controller("api/v1/public/stories")
export class PublicStoriesProxyController extends BaseStoryReelsProxyController {
  constructor(config: ConfigService) {
    super(config);
  }

  @All()
  async proxyRoot(@Req() req: Request, @Res() res: Response) {
    await this.proxy(req, res);
  }

  @All("*")
  async proxyAll(@Req() req: Request, @Res() res: Response) {
    await this.proxy(req, res);
  }
}

@Controller("api/v1/reels")
export class ReelsProxyController extends BaseStoryReelsProxyController {
  constructor(config: ConfigService) {
    super(config);
  }

  @All()
  async proxyRoot(@Req() req: Request, @Res() res: Response) {
    await this.proxy(req, res);
  }

  @All("*")
  async proxyAll(@Req() req: Request, @Res() res: Response) {
    await this.proxy(req, res);
  }
}
