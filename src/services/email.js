const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        // For development/testing, we'll use a test configuration
        // In production, you'd set these via environment variables
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASS || ''
            }
        });

        this.fromEmail = process.env.FROM_EMAIL || 'alerts@siteguard.com';
        this.fromName = 'SiteGuard Alerts';
    }

    // Test if email is configured
    async isConfigured() {
        try {
            if (!process.env.SMTP_USER) {
                return false;
            }
            await this.transporter.verify();
            return true;
        } catch {
            return false;
        }
    }

    // Send alert email when issues are found
    async sendAlertEmail(to, websiteName, websiteUrl, issues) {
        const issuesList = issues.map(issue => {
            const icon = issue.severity === 'critical' ? '🔴' :
                        issue.severity === 'error' ? '🟠' : '🟡';
            return `${icon} ${issue.title}\n   ${issue.description}`;
        }).join('\n\n');

        const criticalCount = issues.filter(i => i.severity === 'critical').length;
        const errorCount = issues.filter(i => i.severity === 'error').length;
        const warningCount = issues.filter(i => i.severity === 'warning').length;

        const subject = criticalCount > 0 
            ? `🚨 URGENT: ${websiteName} is having critical problems`
            : errorCount > 0
            ? `⚠️ Problems found on ${websiteName}`
            : `📋 ${websiteName} health check: ${warningCount} warning(s)`;

        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1e293b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; }
        .issue { background: white; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #dc2626; }
        .issue.warning { border-left-color: #f59e0b; }
        .issue h3 { margin: 0 0 5px 0; color: #1e293b; }
        .issue p { margin: 0; color: #64748b; font-size: 14px; }
        .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 20px; }
        .footer { text-align: center; padding: 20px; color: #94a3b8; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ SiteGuard Alert</h1>
        </div>
        <div class="content">
            <p>We found some problems with <strong>${websiteName}</strong>:</p>
            <p style="color: #64748b; font-size: 14px;">${websiteUrl}</p>
            
            ${issues.map(issue => `
                <div class="issue ${issue.severity === 'warning' ? 'warning' : ''}">
                    <h3>${issue.severity === 'critical' ? '🔴' : issue.severity === 'error' ? '🟠' : '🟡'} ${issue.title}</h3>
                    <p>${issue.description}</p>
                </div>
            `).join('')}
            
            <p>We recommend checking your website as soon as possible to fix these issues.</p>
            
            <a href="${websiteUrl}" class="button">Visit Your Website</a>
        </div>
        <div class="footer">
            <p>You're receiving this because you set up monitoring for ${websiteUrl} on SiteGuard.</p>
            <p>© ${new Date().getFullYear()} SiteGuard - Website Monitoring</p>
        </div>
    </div>
</body>
</html>
        `;

        const text = `
SiteGuard Alert

We found problems with ${websiteName} (${websiteUrl}):

${issuesList}

We recommend checking your website as soon as possible.

---
You're receiving this because you set up monitoring for ${websiteUrl} on SiteGuard.
        `;

        try {
            const info = await this.transporter.sendMail({
                from: `"${this.fromName}" <${this.fromEmail}>`,
                to: to,
                subject: subject,
                text: text,
                html: html
            });

            console.log(`Alert email sent to ${to}: ${info.messageId}`);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send email:', error);
            return { success: false, error: error.message };
        }
    }

    // Send recovery email when issues are resolved
    async sendRecoveryEmail(to, websiteName, websiteUrl) {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { background: #f0fdf4; padding: 20px; border: 1px solid #bbf7d0; border-top: none; border-radius: 0 0 8px 8px; }
        .footer { text-align: center; padding: 20px; color: #94a3b8; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ All Clear!</h1>
        </div>
        <div class="content">
            <p>Good news! <strong>${websiteName}</strong> is back to normal.</p>
            <p style="color: #64748b;">All previously reported issues have been resolved.</p>
            <p>We'll continue monitoring and let you know if anything comes up.</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} SiteGuard - Website Monitoring</p>
        </div>
    </div>
</body>
</html>
        `;

        try {
            const info = await this.transporter.sendMail({
                from: `"${this.fromName}" <${this.fromEmail}>`,
                to: to,
                subject: `✅ ${websiteName} is back to normal`,
                text: `Good news! ${websiteName} (${websiteUrl}) is back to normal. All previously reported issues have been resolved.`,
                html: html
            });

            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send recovery email:', error);
            return { success: false, error: error.message };
        }
    }

    // Send welcome email
    async sendWelcomeEmail(to, name) {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; border-top: none; }
        .step { display: flex; align-items: center; margin: 15px 0; }
        .step-number { background: #2563eb; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px; flex-shrink: 0; }
        .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 20px; }
        .footer { text-align: center; padding: 20px; color: #94a3b8; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ Welcome to SiteGuard!</h1>
        </div>
        <div class="content">
            <p>Hi ${name},</p>
            <p>Thanks for signing up! You're now ready to protect your website from problems.</p>
            
            <h3>Getting Started:</h3>
            
            <div class="step">
                <div class="step-number">1</div>
                <div>Add your website address in your dashboard</div>
            </div>
            
            <div class="step">
                <div class="step-number">2</div>
                <div>We'll start checking it every hour</div>
            </div>
            
            <div class="step">
                <div class="step-number">3</div>
                <div>Get alerts when something breaks</div>
            </div>
            
            <p>That's it! We handle everything else automatically.</p>
            
            <a href="#" class="button">Go to Your Dashboard</a>
        </div>
        <div class="footer">
            <p>Questions? Just reply to this email.</p>
            <p>© ${new Date().getFullYear()} SiteGuard - Website Monitoring</p>
        </div>
    </div>
</body>
</html>
        `;

        try {
            await this.transporter.sendMail({
                from: `"${this.fromName}" <${this.fromEmail}>`,
                to: to,
                subject: '🛡️ Welcome to SiteGuard!',
                text: `Hi ${name}, Thanks for signing up for SiteGuard! Add your website in your dashboard and we'll start protecting it right away.`,
                html: html
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = new EmailService();
