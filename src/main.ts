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
      allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"],
      credentials: true
    },
    logger: ["error", "warn"]
  });
  let isDev = process.env.NODE_ENV == "development";
  app.use(morgan("tiny", {
    skip: function(req, res) {
      if (isDev) {
        return false;
      }
      return res.statusCode < 400;
    }
  }));
  app.use(helmet({crossOriginResourcePolicy: false,}));

  // Add CORS headers for static assets
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
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
    bodyParser.urlencoded({ extended: false, limit: '100mb' })(req, res, next);
  });

  app.use((req, res, next) => {
    if (req.url.includes('/upload') && req.headers['content-type']?.includes('multipart/form-data')) {
      return next();
    }
    bodyParser.json({ limit: '100mb' })(req, res, next);
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

  // Configure static assets with CORS headers
  app.useStaticAssets(join(root.path, "public"), {
    setHeaders: (res, path, stat) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
    }
  });
  app.useStaticAssets(join(root.path, "public", "v-public"), {
    setHeaders: (res, path, stat) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
    }
  });
  app.useStaticAssets(join(root.path, "public", "media"), {
    setHeaders: (res, path, stat) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
    }
  });

  await app.listen(port);

  console.log("app run on port " + port);
}

bootstrap();