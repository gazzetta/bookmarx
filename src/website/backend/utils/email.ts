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
    return process.env.RESEND_FROM_EMAIL || 'BookMarx <support@bookmarks.cc>';
};

const getAppUrl = (): string => {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
};

// ─── Brand-aligned email wrapper ───
// Colors and styles match the website design system (tailwind.config.js)

interface EmailButton {
    text: string;
    url: string;
}

function buildEmailHtml(opts: {
    heading: string;
    bodyHtml: string;
    button?: EmailButton;
    noteHtml?: string;
}): string {
    const year = new Date().getFullYear();

    const buttonHtml = opts.button
        ? `
            <a href="${opts.button.url}"
               style="display:inline-block;background-color:#1A1A1A;color:#FBF8F3;text-decoration:none;padding:16px 40px;border-radius:12px;font-family:'Outfit',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:600;letter-spacing:0.01em;">
                ${opts.button.text}
            </a>`
        : '';

    const noteHtml = opts.noteHtml
        ? `<p style="margin:24px 0 0;font-size:13px;color:#8B8B8B;line-height:1.6;font-family:'Outfit',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                ${opts.noteHtml}
            </p>`
        : '';

    const fallbackUrlHtml = opts.button
        ? `<p style="margin:8px 0 0;font-size:11px;color:#B0B0B0;line-height:1.6;font-family:'Outfit',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                If the button above doesn't work, copy and paste this URL into your browser:<br>
                <a href="${opts.button.url}" style="color:#8B8B8B;word-break:break-all;text-decoration:none;">${opts.button.url}</a>
            </p>`
        : '';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#FBF8F3;font-family:'Outfit',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px;">

        <!-- Logo -->
        <div style="text-align:center;margin-bottom:36px;">
            <div style="display:inline-block;width:44px;height:44px;background-color:#1A1A1A;border-radius:12px;text-align:center;line-height:44px;vertical-align:middle;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FBF8F3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-top:11px;">
                    <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                </svg>
            </div>
            <p style="margin:10px 0 0;font-size:20px;font-weight:600;color:#1A1A1A;letter-spacing:-0.02em;font-family:'Outfit',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">BookMarx</p>
        </div>

        <!-- Card -->
        <div style="background-color:#FFFFFF;border-radius:16px;border:1px solid #EDE6D9;overflow:hidden;box-shadow:0 2px 15px -3px rgba(0,0,0,0.04),0 4px 6px -4px rgba(0,0,0,0.02);">

            <!-- Terra accent bar -->
            <div style="height:4px;background:linear-gradient(90deg,#D4634A 0%,#E8795C 100%);"></div>

            <!-- Content -->
            <div style="padding:40px 36px;text-align:center;">
                <h1 style="margin:0 0 12px;font-size:26px;font-weight:700;color:#1A1A1A;font-family:'Fraunces',Georgia,serif;letter-spacing:-0.02em;line-height:1.2;">${opts.heading}</h1>
                <div style="font-size:15px;color:#6B6B6B;line-height:1.7;font-family:'Outfit',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                    ${opts.bodyHtml}
                </div>

                <div style="margin:28px 0 0;">
                    ${buttonHtml}
                </div>

                ${noteHtml}
            </div>
        </div>

        <!-- Footer -->
        <div style="text-align:center;margin-top:28px;">
            <p style="margin:0;font-size:12px;color:#8B8B8B;font-family:'Outfit',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                &copy; ${year} BookMarx. All rights reserved.
            </p>
            ${fallbackUrlHtml}
        </div>
    </div>
</body>
</html>
            `.trim();
}

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
            html: buildEmailHtml({
                heading: 'Reset Your Password',
                bodyHtml: 'We received a request to reset your password. Click the button below to choose a new one.',
                button: { text: 'Reset Password', url: resetUrl },
                noteHtml: 'This link will expire in 1 hour. If you didn&#39;t request a password reset, you can safely ignore this email.',
            }),
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
