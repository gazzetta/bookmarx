import type { Request, Response } from 'express';
import { randomUUID, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/database';
import { sendPasswordResetEmail } from '../utils/email';
import { hasPremiumOverride } from '../middleware/auth';

interface AuthUser {
    id: string;
    email: string;
    displayName: string | null;
}

interface AuthResponseData {
    token: string;
    user: AuthUser;
}

const getJwtSecret = (): Secret => process.env.JWT_SECRET || '';
const getTokenExpiry = (): SignOptions['expiresIn'] => (process.env.TOKEN_EXPIRY || '30d') as SignOptions['expiresIn'];
const getGoogleClient = () => {
    // We now support multiple client IDs (Extension and Website)
    // The server needs to validate tokens from EITHER source.
    const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
    const websiteClientId = process.env.WEBSITE_GOOGLE_CLIENT_ID || '';

    if (!googleClientId && !websiteClientId) {
        return null;
    }

    // Returns a client configured with the primary ID, but we will need to
    // handle multiple audiences manually in the verify step if the library doesn't support it directly.
    // However, the verifyIdToken method accepts an 'audience' parameter which can be a string or array of strings.
    return new OAuth2Client(googleClientId);
};


const buildUser = (record: {
    id: string;
    email: string;
    displayName: string | null;
    subscriptionTier?: string;
    subscriptionExpiresAt?: number | null;
}): AuthUser & {
    subscriptionTier: string;
    subscriptionExpiresAt: number | null;
    bookmarkLimit: number;
    browserLimit: number;
    collectionLimit: number;
    isPremium: boolean;
} => {
    const config = db.getAppConfig();
    const alwaysPremium = hasPremiumOverride(record.id);
    const validPremium = record.subscriptionTier === 'premium' && (!record.subscriptionExpiresAt || record.subscriptionExpiresAt > Date.now() / 1000);
    const tier = alwaysPremium || validPremium ? 'premium' : 'free';
    const limits = config.limits[tier] || config.limits.free;

    return {
        id: record.id,
        email: record.email,
        displayName: record.displayName,
        subscriptionTier: tier,
        subscriptionExpiresAt: alwaysPremium ? null : (record.subscriptionExpiresAt || null),
        bookmarkLimit: limits.bookmarks,
        browserLimit: limits.browsers,
        collectionLimit: limits.collections,
        isPremium: alwaysPremium || (tier === 'premium' &&
            (!record.subscriptionExpiresAt || record.subscriptionExpiresAt > Math.floor(Date.now() / 1000)))
    };
};

const issueToken = (user: AuthUser): string => {
    const jwtSecret = getJwtSecret();
    return jwt.sign({ sub: user.id, email: user.email, tokenVersion: db.getUserById(user.id)?.tokenVersion ?? 0 }, jwtSecret, { expiresIn: getTokenExpiry(), algorithm: 'HS256' });
};

const sendAuthResponse = (res: Response, data: AuthResponseData) => {
    res.json({
        success: true,
        data
    });
};

const ensureJwtSecret = (res: Response): boolean => {
    const jwtSecret = getJwtSecret();
    if (!jwtSecret || (typeof jwtSecret === 'string' && jwtSecret.length === 0)) {
        res.status(500).json({
            success: false,
            error: {
                message: 'JWT secret is not configured'
            }
        });
        return false;
    }
    return true;
};

export const registerWithEmail = async (req: Request, res: Response) => {
    if (!ensureJwtSecret(res)) return;

    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            error: { message: 'Email and password are required' }
        });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
        return res.status(400).json({ success: false, error: { message: 'Use a valid email and a password of at least 8 characters (maximum 72 bytes).' } });
    }
    if (!db.getAppConfig().features.registrationsEnabled) {
        return res.status(403).json({ success: false, error: { message: 'Registration is temporarily unavailable' } });
    }

    const existingUser = db.getUserByEmail(email);
    if (existingUser) {
        return res.status(409).json({
            success: false,
            error: { message: 'Email is already registered' }
        });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const userId = randomUUID();
        const displayName = email.split('@')[0] || email;

        db.createUser({
            id: userId,
            email,
            passwordHash,
            displayName
        });
        db.ensureDefaultCollection(userId);

        const user = buildUser({ id: userId, email, displayName });
        const token = issueToken(user);

        return sendAuthResponse(res, { token, user });
    } catch (error) {
        const err = error as { code?: string };

        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
            return res.status(409).json({
                success: false,
                error: { message: 'Email is already registered' }
            });
        }

        if (err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED') {
            return res.status(503).json({
                success: false,
                error: { message: 'Database is busy, please retry in a moment' }
            });
        }

        console.error('Register error:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: process.env.NODE_ENV === 'development'
                    ? (error instanceof Error ? error.message : 'Registration failed')
                    : 'Registration failed'
            }
        });
    }
};

export const loginWithEmail = async (req: Request, res: Response) => {
    if (!ensureJwtSecret(res)) return;

    try {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const password = req.body?.password;

        if (!email || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 72) {
            return res.status(400).json({
                success: false,
                error: { message: 'Email and password are required' }
            });
        }

        const user = db.getUserByEmail(email);
        if (!user || !user.passwordHash) {
            return res.status(401).json({
                success: false,
                error: { message: 'Invalid credentials' }
            });
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                error: { message: 'Invalid credentials' }
            });
        }

        const authUser = buildUser(user);
        const token = issueToken(authUser);

        return sendAuthResponse(res, { token, user: authUser });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: process.env.NODE_ENV === 'development'
                    ? (error instanceof Error ? error.message : 'Login failed')
                    : 'Login failed'
            }
        });
    }
};

export const loginWithGoogle = async (req: Request, res: Response) => {
    if (!ensureJwtSecret(res)) return;

    const linkAccountId = (req as Request & { user?: { id: string } }).user?.id;
    const linkAccount = linkAccountId ? db.getUserById(linkAccountId) : undefined;
    if (linkAccountId && (!linkAccount?.passwordHash || typeof req.body.password !== 'string' ||
        Buffer.byteLength(req.body.password, 'utf8') > 72 || !await bcrypt.compare(req.body.password, linkAccount.passwordHash))) {
        return res.status(401).json({ success: false, error: { message: 'Confirm your current password to link Google' } });
    }

    const { accessToken } = req.body as { accessToken?: string };

    if (!accessToken) {
        return res.status(400).json({
            success: false,
            error: { message: 'Google credential is required' }
        });
    }

    const oauthClient = getGoogleClient();
    if (!oauthClient) {
        return res.status(500).json({
            success: false,
            error: { message: 'Google client ID is not configured' }
        });
    }

    try {
        const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
        const websiteClientId = process.env.WEBSITE_GOOGLE_CLIENT_ID || '';
        
        // Build list of valid audiences (client IDs that can issue tokens)
        const audiences = [googleClientId, websiteClientId].filter(id => id.length > 0);
        
        let providerUserId: string | undefined;
        let email: string | undefined;
        let emailVerified = false;
        
        // Try to verify as ID token (JWT) first - used by website
        try {
            const ticket = await oauthClient.verifyIdToken({
                idToken: accessToken,
                audience: audiences
            });
            
            const payload = ticket.getPayload();
            if (payload) {
                providerUserId = payload.sub;
                email = payload.email;
                emailVerified = payload.email_verified === true;
            }
        } catch (idTokenError) {
            // Not an ID token, try as access token - used by extension
            const tokenInfo = await oauthClient.getTokenInfo(accessToken);
            providerUserId = tokenInfo.sub || tokenInfo.user_id;
            email = tokenInfo.email;
            
            // Validate audience for access token
            const validAudience = (tokenInfo.aud === googleClientId) || (tokenInfo.aud === websiteClientId);
            if (!validAudience) {
                console.error('Audience mismatch. Expected one of:', [googleClientId, websiteClientId], 'Received:', tokenInfo.aud);
                return res.status(401).json({
                    success: false,
                    error: { message: 'Google token audience mismatch' }
                });
            }
            const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) });
            if (!profileResponse.ok) throw new Error('Google profile verification failed');
            const profile = await profileResponse.json() as any;
            if (profile.sub !== providerUserId || profile.email !== email) throw new Error('Google identity does not match');
            emailVerified = profile.email_verified === true;
        }

        if (!providerUserId || !email || !emailVerified) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unable to verify Google token' }
            });
        }
        email = email.trim().toLowerCase();

        let identity = db.getIdentity('google', providerUserId);
        if (linkAccountId) {
            const linked = db.transaction(() => {
                const current = db.getUserById(linkAccountId);
                if (!current || current.tokenVersion !== linkAccount?.tokenVersion || current.passwordHash !== linkAccount?.passwordHash) throw new Error('Your session changed; sign in again');
                const existing = db.getIdentity('google', providerUserId!);
                if (existing && existing.userId !== linkAccountId) throw new Error('This Google account is already linked to another BookMarx account');
                if (!existing) db.createIdentity({ userId: linkAccountId, provider: 'google', providerUserId: providerUserId!, email });
                return current;
            });
            const authUser = buildUser(linked);
            return sendAuthResponse(res, { token: issueToken(authUser), user: authUser });
        }
        let user = identity ? db.getUserById(identity.userId) : null;

        if (!user) {
            const existingUser = db.getUserByEmail(email);
            if (existingUser) {
                return res.status(409).json({ success: false, error: { code: 'ACCOUNT_LINK_REQUIRED',
                    message: 'An account already uses this email. Sign in with your existing password before linking Google in Settings → Account.' } });
            } else {
                const userId = randomUUID();
                const displayName = email.split('@')[0] || email;
                db.createUser({ id: userId, email, passwordHash: null, displayName });
                user = db.getUserById(userId);
            }

            if (user) {
                db.createIdentity({
                    userId: user.id,
                    provider: 'google',
                    providerUserId,
                    email
                });
            }
        }

        if (!user) {
            return res.status(500).json({
                success: false,
                error: { message: 'Failed to create user' }
            });
        }

        const authUser = buildUser(user);
        const token = issueToken(authUser);

        return sendAuthResponse(res, { token, user: authUser });
    } catch (error) {
        console.error('Google auth error:', error);
        return res.status(500).json({
            success: false,
            error: { message: 'Google authentication failed' }
        });
    }
};

export const getMe = async (req: Request, res: Response) => {
    const authUser = (req as Request & { user?: { id: string; email: string } }).user;

    if (!authUser) {
        return res.status(401).json({
            success: false,
            error: { message: 'Unauthorized' }
        });
    }

    const user = db.getUserById(authUser.id);
    if (!user) {
        return res.status(404).json({
            success: false,
            error: { message: 'User not found' }
        });
    }

    return res.json({
        success: true,
        data: buildUser(user)
    });
};

export const forgotPassword = async (req: Request, res: Response) => {
    try {
        const { email } = req.body as { email?: string };

        if (!email) {
            return res.status(400).json({
                success: false,
                error: { message: 'Email is required' }
            });
        }

        const user = db.getUserByEmail(email);

        // Always return success to prevent email enumeration
        // but only actually send an email if the user exists and has a password
        if (user && user.passwordHash) {
            const token = randomBytes(32).toString('hex');
            const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

            db.createPasswordResetToken(user.id, token, expiresAt);

            const emailSent = await sendPasswordResetEmail(email, token);
            if (!emailSent) {
                console.error(`Failed to send password reset email to ${email}`);
            }
        } else {
            console.log(`Password reset requested for non-existent or OAuth-only account: ${email}`);
        }

        // Always return success (don't reveal if account exists)
        return res.json({
            success: true,
            data: { message: 'If an account with that email exists, a password reset link has been sent.' }
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        return res.status(500).json({
            success: false,
            error: { message: 'Failed to process password reset request' }
        });
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    try {
        const { token, password } = req.body as { token?: string; password?: string };

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                error: { message: 'Token and new password are required' }
            });
        }

        if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
            return res.status(400).json({
                success: false,
                error: { message: 'Password must be at least 8 characters' }
            });
        }

        // Look up the token
        const resetToken = db.getPasswordResetToken(token);
        if (!resetToken) {
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid or expired reset token' }
            });
        }

        // Check if token has been used
        if (resetToken.usedAt) {
            return res.status(400).json({
                success: false,
                error: { message: 'This reset link has already been used' }
            });
        }

        // Check if token has expired
        const now = Math.floor(Date.now() / 1000);
        if (now > resetToken.expiresAt) {
            return res.status(400).json({
                success: false,
                error: { message: 'This reset link has expired. Please request a new one.' }
            });
        }

        // Hash the new password and update
        const passwordHash = await bcrypt.hash(password, 10);
        const updated = db.transaction(() => {
            const live = db.getPasswordResetToken(token);
            if (!live || live.usedAt || live.expiresAt < Math.floor(Date.now() / 1000)) return false;
            const result = db.updateUserPassword(live.userId, passwordHash);
            if (!result) throw new Error('Password update failed');
            db.markPasswordResetTokenUsed(token);
            return true;
        });

        if (!updated) {
            return res.status(400).json({
                success: false,
                error: { message: 'Reset token has expired or has already been used' }
            });
        }

        return res.json({
            success: true,
            data: { message: 'Password has been reset successfully' }
        });
    } catch (error) {
        console.error('Reset password error:', error);
        return res.status(500).json({
            success: false,
            error: { message: 'Failed to reset password' }
        });
    }
};

export const getUserStats = async (req: Request, res: Response) => {
    const authUser = (req as Request & { user?: { id: string; email: string } }).user;

    if (!authUser) {
        return res.status(401).json({
            success: false,
            error: { message: 'Unauthorized' }
        });
    }

    try {
        const bookmarkCount = db.getBookmarkCountForUser(authUser.id);
        const browserCount = db.getBrowserCount(authUser.id);
        const collectionCount = db.getCollectionCount(authUser.id);

        return res.json({
            success: true,
            data: {
                bookmarkCount,
                browserCount,
                collectionCount
            }
        });
    } catch (error) {
        console.error('Failed to get user stats:', error);
        return res.status(500).json({
            success: false,
            error: { message: 'Failed to get user stats' }
        });
    }
};
