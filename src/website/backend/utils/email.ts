import { Resend } from 'resend';

const getResendClient = (): Resend | null => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.warn('RESEND_API_KEY is not configured - emails will not be sent');
        return null;
    }
    return new Resend(apiKey);
};

const getFromEmail = (): string => {
    return process.env.RESEND_FROM_EMAIL || 'BookMarx <bookmarx@gasdigital.co.uk>';
};

const getAppUrl = (): string => {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
};

export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
    const resend = getResendClient();
    const appUrl = getAppUrl();
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    if (!resend) {
        // In development, log the reset link to console
        console.log('=== PASSWORD RESET (no email configured) ===');
        console.log(`Email: ${email}`);
        console.log(`Reset URL: ${resetUrl}`);
        console.log('============================================');
        return true; // Return true so the flow works in development
    }

    try {
        const { error } = await resend.emails.send({
            from: getFromEmail(),
            to: email,
            subject: 'Reset your BookMarx password',
            html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
        <!-- Logo -->
        <div style="text-align:center;margin-bottom:32px;">
            <div style="display:inline-block;width:40px;height:40px;background-color:#1C1917;border-radius:12px;line-height:40px;text-align:center;">
                <span style="color:#FAF8F5;font-size:20px;">&#9776;</span>
            </div>
            <p style="margin:8px 0 0;font-size:18px;font-weight:600;color:#1C1917;">BookMarx</p>
        </div>

        <!-- Card -->
        <div style="background-color:#FFFFFF;border-radius:16px;border:1px solid #E7E3DD;padding:32px;text-align:center;">
            <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1C1917;">Reset Your Password</h1>
            <p style="margin:0 0 24px;font-size:15px;color:#78716C;line-height:1.6;">
                We received a request to reset your password. Click the button below to choose a new one.
            </p>

            <a href="${resetUrl}" 
               style="display:inline-block;background-color:#1C1917;color:#FAF8F5;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:600;">
                Reset Password
            </a>

            <p style="margin:24px 0 0;font-size:13px;color:#A8A29E;line-height:1.5;">
                This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
            </p>
        </div>

        <!-- Footer -->
        <div style="text-align:center;margin-top:24px;">
            <p style="margin:0;font-size:12px;color:#A8A29E;">
                &copy; ${new Date().getFullYear()} BookMarx. All rights reserved.
            </p>
            <p style="margin:8px 0 0;font-size:11px;color:#D6D3D1;">
                If the button above doesn't work, copy and paste this URL into your browser:<br>
                <a href="${resetUrl}" style="color:#A8A29E;word-break:break-all;">${resetUrl}</a>
            </p>
        </div>
    </div>
</body>
</html>
            `.trim(),
        });

        if (error) {
            console.error('Failed to send password reset email:', error);
            return false;
        }

        console.log(`Password reset email sent to ${email}`);
        return true;
    } catch (err) {
        console.error('Error sending password reset email:', err);
        return false;
    }
}
