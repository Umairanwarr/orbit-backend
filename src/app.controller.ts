/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {Controller, Get, Param, Query, Res} from "@nestjs/common";
import {join} from "path";
 import {ConfigService} from "@nestjs/config";

@Controller()
export class AppController {

    constructor(
        private readonly configService: ConfigService
    ) {
    }

    @Get("privacy-policy")
    servePrivacyPolicy(@Res() res) {
        return res.sendFile(join(process.cwd(), "public/privacy-policy.html"));
    }

    @Get("profile/:id")
    serveProfile(@Res() res, @Param("id") id: string) {
        // Serve a simple HTML page that redirects to the app or shows download links
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Orbit Profile</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
        .container { max-width: 400px; margin: 0 auto; }
        .profile-card { background: #f5f5f5; padding: 20px; border-radius: 10px; margin: 20px 0; }
        .download-btn { display: inline-block; padding: 12px 24px; margin: 10px; background: #007AFF; color: white; text-decoration: none; border-radius: 8px; }
        .download-btn:hover { background: #0056CC; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Orbit Profile</h1>
        <div class="profile-card">
            <p>Open this profile in the Orbit app for the best experience!</p>
        </div>
        <a href="orbit://profile/${id}" class="download-btn">Open in App</a>
        <br>
        <p>Don't have the app? Download it now:</p>
        <a href="https://play.google.com/store/apps/details?id=com.orbit.ke" class="download-btn">Android</a>
        <a href="https://apps.apple.com/us/app/orbitt-chat/id6748567153" class="download-btn">iOS</a>
    </div>
    <script>
        // Try to open the app automatically
        setTimeout(() => {
            window.location.href = 'orbit://profile/${id}';
        }, 1000);
    </script>
</body>
</html>`;
        res.send(html);
    }

    @Get()
    getHello(@Res() res): string {
        return res.sendFile(join(process.cwd(), "public/home.html"));
    }

}
