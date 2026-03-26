
import {Controller, Get, Param, Query, Res} from "@nestjs/common";
import {join} from "path";
import {ConfigService} from "@nestjs/config";
import { GroupChannelService } from "./chat/channel/services/group.channel.service";

@Controller()
export class AppController {

    constructor(
        private readonly configService: ConfigService,
        private readonly groupChannelService: GroupChannelService
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

    @Get("live/:id")
    serveLiveLanding(@Res() res, @Param("id") id: string) {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Watch Live on Orbit</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
        .container { max-width: 420px; margin: 0 auto; }
        .card { background: #f5f5f5; padding: 20px; border-radius: 10px; margin: 20px 0; }
        .download-btn { display: inline-block; padding: 12px 24px; margin: 10px; background: #007AFF; color: white; text-decoration: none; border-radius: 8px; }
        .download-btn:hover { background: #0056CC; }
        .open-app { background: #28a745; }
        .open-app:hover { background: #218838; }
        .code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background:#eef8f3; border:1px dashed #b9e6cf; padding:.25rem .5rem; border-radius:6px; color:#0a6; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Orbit Live Stream</h1>
        <div class="card">
            <p>Open this live stream in the Orbit app for the best experience!</p>
            <p>Stream ID: <span class="code">${id}</span></p>
        </div>
        <a href="orbit://live/${id}" class="download-btn open-app">Open in App</a>
        <br>
        <p>Don't have the app? Download it now:</p>
        <a href="https://play.google.com/store/apps/details?id=com.orbit.ke" class="download-btn">Android</a>
        <a href="https://apps.apple.com/us/app/orbitt-chat/id6748567153" class="download-btn">iOS</a>
    </div>
    <script>
        // Try to open the app automatically
        setTimeout(function(){ window.location.href = 'orbit://live/${id}'; }, 800);
    </script>
</body>
</html>`;
        res.send(html);
    }

    @Get("g/:code")
    async serveGroupInvite(@Res() res, @Param("code") code: string) {
        let isChannel = false;
        try {
            const metadata = await this.groupChannelService.resolveInviteCode(code);
            isChannel = metadata.isChannel;
        } catch (e) {
            // Silent fail, default to group
        }

        const title = isChannel ? "Orbit Channel Invite" : "Orbit Group Invite";
        const message = isChannel ? "channel" : "group";

        // Serve a landing page with a clear Open in App button, consistent with profile page
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
        .container { max-width: 420px; margin: 0 auto; }
        .card { background: #f5f5f5; padding: 20px; border-radius: 10px; margin: 20px 0; }
        .download-btn { display: inline-block; padding: 12px 24px; margin: 10px; background: #007AFF; color: white; text-decoration: none; border-radius: 8px; }
        .download-btn:hover { background: #0056CC; }
        .open-app { background: #28a745; }
        .open-app:hover { background: #218838; }
        .code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background:#eef8f3; border:1px dashed #b9e6cf; padding:.25rem .5rem; border-radius:6px; color:#0a6; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${title}</h1>
        <div class="card">
            <p>Open this ${message} in the Orbit app for the best experience!</p>
            <p>Invite code: <span class="code">${code}</span></p>
        </div>
        <a href="orbit://g/${code}" class="download-btn open-app">Open in App</a>
        <br>
        <p>Don't have the app? Download it now:</p>
        <a href="https://play.google.com/store/apps/details?id=com.orbit.ke" class="download-btn">Android</a>
        <a href="https://apps.apple.com/us/app/orbitt-chat/id6748567153" class="download-btn">iOS</a>
    </div>
    <script>
        // Try to open the app automatically
        setTimeout(function(){ window.location.href = 'orbit://g/${code}'; }, 800);
    </script>
</body>
</html>`;
        res.send(html);
    }

    @Get("verify-email")
    serveVerifyEmail(@Res() res, @Query("token") token: string, @Query("email") email: string) {
        // Serve a landing page similar to reset-password for email verification
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Email Verification - Orbit</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 20px; background: #f0f2f5; }
        .container { max-width: 400px; margin: 0 auto; }
        .card { background: white; padding: 30px; border-radius: 15px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .success-icon { font-size: 48px; color: #4CAF50; margin-bottom: 20px; }
        .download-btn { display: inline-block; padding: 15px 30px; margin: 10px; background: #007AFF; color: white; text-decoration: none; border-radius: 10px; font-weight: bold; }
        .download-btn:hover { background: #0056CC; }
        .open-app-btn { background: #4CAF50; }
        .open-app-btn:hover { background: #45a049; }
        .info { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; font-size: 14px; color: #666; }
    </style>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: blob: *; media-src 'self' data: blob: *; connect-src 'self' *; style-src 'self' 'unsafe-inline'; script-src 'self'">
    <meta http-equiv="X-Content-Type-Options" content="nosniff">
    <meta http-equiv="Referrer-Policy" content="no-referrer">
    <meta http-equiv="X-Frame-Options" content="SAMEORIGIN">
    <meta http-equiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=()">
    <meta name="format-detection" content="telephone=no">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <link rel="icon" href="/v-public/default_user_image.png">
    <meta property="al:ios:url" content="orbit://verify-email?token=${token || ''}&email=${email || ''}">
    <meta property="al:android:url" content="orbit://verify-email?token=${token || ''}&email=${email || ''}">
    <meta property="al:web:url" content="https://api.orbit.ke/verify-email?token=${token || ''}&email=${email || ''}">
    <meta name="apple-itunes-app" content="app-id=6748567153">
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="success-icon">✅</div>
            <h1>Email Verification Link Verified</h1>
            <p>Your email verification link is valid and ready to use!</p>
            ${(token && email) ? `<div class="info">Click the button below to open the Orbit app and complete your signup.</div>` : ''}
        </div>
        <a href="orbit://verify-email?token=${token || ''}&email=${email || ''}" class="download-btn open-app-btn">Open Orbit App</a>
        <br><br>
        <p>Don't have the app? Download it now:</p>
        <a href="https://play.google.com/store/apps/details?id=com.orbit.ke" class="download-btn">Download for Android</a>
        <a href="https://apps.apple.com/us/app/orbitt-chat/id6748567153" class="download-btn">Download for iOS</a>
    </div>
    <script>
        // Try to open the app automatically after a short delay
        setTimeout(() => {
            const token = '${token || ''}';
            const email = '${email || ''}';
            if (token && email) {
                window.location.href = 'orbit://verify-email?token=' + token + '&email=' + email;
            }
        }, 2000);
    </script>
</body>
</html>`;
        res.send(html);
    }

    @Get("reset-password")
    serveResetPassword(@Res() res) {
        return res.sendFile(join(process.cwd(), "public/reset-password.html"));
    }

    @Get()
    getHello(@Res() res): string {
        return res.sendFile(join(process.cwd(), "public/home.html"));
    }

}
