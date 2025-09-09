
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

    @Get("reset-password")
    serveResetPassword(@Res() res, @Query("token") token: string, @Query("email") email: string) {
        // Serve a simple HTML page that redirects to the app or shows download links
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Reset Password - Orbit</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 20px; background: #f0f2f5; }
        .container { max-width: 400px; margin: 0 auto; }
        .reset-card { background: white; padding: 30px; border-radius: 15px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .success-icon { font-size: 48px; color: #4CAF50; margin-bottom: 20px; }
        .download-btn { display: inline-block; padding: 15px 30px; margin: 10px; background: #007AFF; color: white; text-decoration: none; border-radius: 10px; font-weight: bold; }
        .download-btn:hover { background: #0056CC; }
        .open-app-btn { background: #4CAF50; }
        .open-app-btn:hover { background: #45a049; }
        .token-info { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; font-size: 14px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="reset-card">
            <div class="success-icon">✅</div>
            <h1>Password Reset Link Verified</h1>
            <p>Your password reset link is valid and ready to use!</p>
            ${token ? `<div class="token-info">Click the button below to open the Orbit app and reset your password.</div>` : ''}
        </div>
        <a href="orbit://reset-password?token=${token || ''}&email=${email || ''}" class="download-btn open-app-btn">Open Orbit App</a>
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
                window.location.href = 'orbit://reset-password?token=' + token + '&email=' + email;
            }
        }, 2000);
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
