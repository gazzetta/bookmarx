// src/server/config/environments/development.ts
import { ServerConfigSettings } from './base';

export const config: ServerConfigSettings = {
    server: {
        port: 3000,
        host: 'localhost',
        apiUrl: 'http://localhost:3000',
    },
    cors: {
        allowedOrigins: ['http://localhost:3000', 'http://localhost:8080'],
    },
    rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 1000,
    },
    auth: {
        jwtSecret: 'dev-secret-key',
        tokenExpiry: '24h',
    },
    db: {
        uri: 'mongodb://localhost:27017/bookmarx_dev',
        options: {
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    },
};