/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

import path, { join } from "path";
import * as admin from "firebase-admin";
import root from "app-root-path";
import { setDefaultResultOrder } from "dns";

const xss = require("xss-clean");
const requestIp = require("request-ip");
import bodyParser from "body-parser";
import helmet from "helmet";

import morgan from "morgan";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { RedisIoAdapter } from "./chat/socket_io/redis-io.adapter";

/**
 * Initializes and starts the application. Configures the application with various middleware,
 * services, and providers based on environment variables. Sets up push notification providers,
 * initializes websocket adapters, and starts the server on the configured port.
 *
 * @return {Promise<void>} A promise that resolves once the application is successfully initialized and started.
 */
setDefaultResultOrder('ipv4first');
async function bootstrap() {
  console.log(process.env.NODE_ENV)
  if (process.env.isFirebaseFcmEnabled == "true") {
    console.log("You use firebase as  push notification provider");
    await admin.initializeApp({ credential: admin.credential.cert(path.join(root.path, "firebase-adminsdk.json")) });
  }
  if (process.env.isOneSignalEnabled == "true") {
    console.log("You use  OneSignal as  push notification provider ");
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With", "admin-key"],
      credentials: true
    },
    logger: ["error", "warn"]
  });
  let isDev = process.env.NODE_ENV == "development";
  // Globally filter noisy console logs (non-payment noise)
  try {
    const originalLog = console.log.bind(console);
    const LOG_FILTER_PATTERNS = [
      /^AuthService: getVerifiedUser/,
      /^UserService: findByIdForAuth/,
      /^=== STORY FINDALL DEBUG ===/,
      /^\[Sched]/,
      /^\[SchedCreate]/,
      /^\[SchedTimer]/,
    ];
    console.log = (...args: any[]) => {
      try {
        const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
        if (LOG_FILTER_PATTERNS.some((r) => r.test(msg))) return;
      } catch {}
      return originalLog(...args);
    };
  } catch {}
  // Limit logs to M-Pesa payments and recording purchase/access endpoints
  app.use(morgan("tiny", {
    skip: function(req, res) {
      try {
        const url = req?.url || "";
        const isPayment = /\/api\/v1\/payments\/(mpesa|paystack)\//.test(url);
        const isRecordingPurchase = /\/api\/v1\/live-stream\/recordings\/.+(purchase|access|playback)/.test(url);
        const isGiftPurchase = /\/api\/v1\/live-stream\/[0-9a-fA-F]{24}\/gift\/[0-9a-fA-F]{24}\/purchase/.test(url);
        const isGiftStatus = /\/api\/v1\/live-stream\/[0-9a-fA-F]{24}\/gift\/[0-9a-fA-F]{24}\/purchase\/status/.test(url);
        const shouldLog = isPayment || isRecordingPurchase || isGiftPurchase || isGiftStatus;
        // Only log purchase-related traffic; skip everything else
        return !shouldLog;
      } catch {
        // Fallback: in case of error, skip non-errors in prod, log all in dev
        if (isDev) return false;
        return res.statusCode < 400;
      }
    }
  }));
  // Configure Helmet with a CSP that allows our static page and cross-origin media playback
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // Only this origin by default
          "default-src": ["'self'"],
          // Allow inline scripts for verify-email.html
          "script-src": ["'self'", "'unsafe-inline'"],
          // Our page uses inline <style> in recording.html
          "style-src": ["'self'", "'unsafe-inline'"],
          // Thumbnails/posters can be on OSS or elsewhere
          "img-src": ["'self'", "data:", "blob:", "*"] as any,
          // Video media ultimately streams from OSS; allow it
          "media-src": ["'self'", "data:", "blob:", "*"] as any,
          // Permit HLS segment/XHR if needed in future
          "connect-src": ["'self'", "*"] as any,
        },
      },
    })
  );

  // Add CORS headers for static assets
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With, admin-key');
    res.header('Access-Control-Allow-Credentials', 'true');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Skip body parsing for file upload routes
  app.use((req, res, next) => {
    if (req.url.includes('/upload') && req.headers['content-type']?.includes('multipart/form-data')) {
      console.log('Skipping body parser for file upload:', req.url);
      return next();
    }
    bodyParser.urlencoded({
      extended: false,
      limit: '100mb',
      verify: (req: any, _res: any, buf: Buffer) => {
        try {
          req.rawBody = buf;
        } catch {}
      },
    })(req, res, next);
  });

  app.use((req, res, next) => {
    if (req.url.includes('/upload') && req.headers['content-type']?.includes('multipart/form-data')) {
      return next();
    }
    bodyParser.json({
      limit: '100mb',
      verify: (req: any, _res: any, buf: Buffer) => {
        try {
          req.rawBody = buf;
        } catch {}
      },
    })(req, res, next);
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // it case with i18n RangeError: Maximum call stack size exceeded
      validateCustomDecorators: false,
      stopAtFirstError: true,
      transform: true
    })
  );
  app.use(requestIp.mw());
  app.use(xss());
  const redisIoAdapter = new RedisIoAdapter(app);
  app.useWebSocketAdapter(redisIoAdapter);
  const port = process.env.PORT ?? 80;

  // Configure static assets with explicit URL prefixes and CORS headers
  // 1) Serve the whole /public directory at root for HTML files (home.html, privacy-policy.html, reset-password.html, etc.)
  // Enable extensionless HTML so /reset-password resolves to reset-password.html
  app.useStaticAssets(join(root.path, 'public'), {
    extensions: ['html'],
    setHeaders: (res, _path, _stat) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With, admin-key');
    },
  });

  // 2) Serve media under /v-public prefix (e.g. /v-public/pic100-xxx.jpg)
  app.useStaticAssets(join(root.path, 'public', 'v-public'), {
    prefix: '/v-public',
    setHeaders: (res, _path, _stat) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With, admin-key');
    },
  });

  // 3) Serve media under /media prefix (if used)
  app.useStaticAssets(join(root.path, 'public', 'media'), {
    prefix: '/media',
    setHeaders: (res, _path, _stat) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With, admin-key');
    },
  });

  // 4) Serve live recordings under /recordings prefix
  app.useStaticAssets(join(root.path, 'public', 'live_recordings'), {
    prefix: '/recordings',
    setHeaders: (res, _path, _stat) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With, admin-key');
    },
  });

  await app.listen(port);

  console.log("app run on port " + port);
}

bootstrap();