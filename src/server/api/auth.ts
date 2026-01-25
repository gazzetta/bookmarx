import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/database';

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
    const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
    if (!googleClientId) {
        return null;
    }
    return new OAuth2Client(googleClientId);
};

const buildUser = (record: { id: string; email: string; displayName: string | null }): AuthUser => ({
    id: record.id,
    email: record.email,
    displayName: record.displayName
});

const issueToken = (user: AuthUser): string => {
    const jwtSecret = getJwtSecret();
    return jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: getTokenExpiry() });
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

    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            error: { message: 'Email and password are required' }
        });
    }

    const existingUser = db.getUserByEmail(email);
    if (existingUser) {
        return res.status(409).json({
            success: false,
            error: { message: 'Email is already registered' }
        });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = randomUUID();
    const displayName = email.split('@')[0] || email;

    db.createUser({
        id: userId,
        email,
        passwordHash,
        displayName
    });

    const user = buildUser({ id: userId, email, displayName });
    const token = issueToken(user);

    return sendAuthResponse(res, { token, user });
};

export const loginWithEmail = async (req: Request, res: Response) => {
    if (!ensureJwtSecret(res)) return;

    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
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
};

export const loginWithGoogle = async (req: Request, res: Response) => {
    if (!ensureJwtSecret(res)) return;

    const { accessToken } = req.body as { accessToken?: string };

    if (!accessToken) {
        return res.status(400).json({
            success: false,
            error: { message: 'Google access token is required' }
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
        const tokenInfo = await oauthClient.getTokenInfo(accessToken);
        const providerUserId = tokenInfo.sub || tokenInfo.user_id;
        const email = tokenInfo.email;

        if (!providerUserId || !email) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unable to verify Google token' }
            });
        }

        const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
        if (tokenInfo.aud && googleClientId && tokenInfo.aud !== googleClientId) {
            return res.status(401).json({
                success: false,
                error: { message: 'Google token audience mismatch' }
            });
        }

        let identity = db.getIdentity('google', providerUserId);
        let user = identity ? db.getUserById(identity.userId) : null;

        if (!user) {
            const existingUser = db.getUserByEmail(email);
            if (existingUser) {
                user = existingUser;
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
