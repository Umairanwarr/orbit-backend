/**
 * Script to test SMTP configuration
 * Run with: node src/scripts/test-smtp.js
 */
 const path = require('path');
 const fs = require('fs');
 // Allow choosing env via CLI or NODE_ENV
 // Examples:
 //  - node src/scripts/test-smtp.js --env=development
 //  - node src/scripts/test-smtp.js --env=production
 //  - node src/scripts/test-smtp.js --env-file=/absolute/path/to/.env.custom
 const argEnv = process.argv.find(a => a.startsWith('--env='))?.split('=')[1];
 const argEnvFile = process.argv.find(a => a.startsWith('--env-file='))?.split('=')[1];
 const envName = argEnv || process.env.NODE_ENV || 'production';
 let envPath = argEnvFile || path.join(__dirname, `../../.env.${envName}`);
 if (!fs.existsSync(envPath)) {
     envPath = path.join(__dirname, '../../.env.production');
 }
 require('dotenv').config({ path: envPath });
 console.log('Loaded env file:', envPath);
 const nodemailer = require('nodemailer');

async function testSMTP() {
    try {
        const providerRaw = (process.env.EMAIL_PROVIDER || '').toLowerCase().trim();
        const provider =
            providerRaw === 'sendgrid' || providerRaw === 'sg'
                ? 'sendgrid'
                : providerRaw === 'smtp' || providerRaw === 'namecheap' || providerRaw === 'privateemail' || providerRaw === 'custom'
                    ? 'smtp'
                    : (!!process.env.SENDGRID_API_KEY || (process.env.EMAIL_HOST || '').includes('sendgrid'))
                        ? 'sendgrid'
                        : 'smtp';
        const isSendGrid = provider === 'sendgrid';
        const host = isSendGrid ? 'smtp.sendgrid.net' : process.env.EMAIL_HOST;
        // Default to 587 (submission port) which is supported by DigitalOcean
        const port = parseInt(process.env.EMAIL_PORT || '587', 10);
        const secure = (process.env.EMAIL_SECURE || '').toLowerCase() === 'true' || port === 465;
        const auth = isSendGrid
            ? { user: 'apikey', pass: process.env.SENDGRID_API_KEY || process.env.EMAIL_PASSWORD }
            : { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD };

        console.log('Testing SMTP configuration...');
        console.log('PROVIDER:', isSendGrid ? 'SendGrid (SMTP)' : 'Custom SMTP');
        console.log('EMAIL_HOST:', host);
        console.log('EMAIL_PORT:', port);
        console.log('EMAIL_SECURE:', secure);
        console.log('EMAIL_USER:', auth.user === 'apikey' ? 'apikey' : auth.user);
        console.log('EMAIL_FROM:', process.env.EMAIL_FROM || process.env.EMAIL_USER);

        const transporter = nodemailer.createTransport({
            host,
            port,
            secure, // true for 465, false for STARTTLS
            auth,
            tls: { rejectUnauthorized: false },
            connectionTimeout: parseInt(process.env.EMAIL_CONNECTION_TIMEOUT || '10000', 10),
            greetingTimeout: parseInt(process.env.EMAIL_GREETING_TIMEOUT || '10000', 10),
            socketTimeout: parseInt(process.env.EMAIL_SOCKET_TIMEOUT || '10000', 10),
        });

        console.log('Verifying SMTP connection...');
        await transporter.verify();
        console.log('✅ SMTP connection verified successfully!');

        console.log('Sending test email...');
        const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
        const toEmail = process.env.TEST_EMAIL_TO || process.env.EMAIL_TO || process.env.EMAIL_USER;
        const info = await transporter.sendMail({
            from: `"Test" <${fromEmail}>`,
            to: toEmail || fromEmail, // Send to self if no TEST_EMAIL_TO
            subject: 'SMTP Test Email',
            text: 'This is a test email to verify SMTP configuration.',
            html: '<p>This is a test email to verify SMTP configuration.</p>'
        });

        console.log('✅ Test email sent successfully!');
        console.log('Message ID:', info.messageId);
        console.log('Accepted:', info.accepted);
        console.log('Rejected:', info.rejected);
        
    } catch (error) {
        console.error('❌ SMTP test failed:');
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        if (error.response) {
            console.error('SMTP response:', error.response);
        }
        
        // Suggest solutions
        if (error.code === 'EAUTH') {
            console.log('\n💡 Suggestions:');
            console.log('1. If using SendGrid, ensure SENDGRID_API_KEY is set and valid, and the sender is verified');
            console.log('2. If using custom SMTP, ensure EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD are set and valid');
            console.log('3. Verify network allows outbound SMTP on port 587 (DigitalOcean supports 587). For port 465, set EMAIL_SECURE=true.');
        }
    }
}

testSMTP();
