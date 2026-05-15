import {
  All,
  Controller,
  Req,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { Request, Response } from "express";

@Controller("api/v1/auth")
export class AuthProxyController {
  constructor(private readonly config: ConfigService) {}

  @All("*")
  async proxyAuth(@Req() req: Request, @Res() res: Response) {
    const base = this.config
      .get<string>("AUTH_SERVICE_BASE_URL", "")
      .replace(/\/+$/, "");
    if (!base) {
      throw new ServiceUnavailableException(
        "AUTH_SERVICE_BASE_URL is not configured"
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
