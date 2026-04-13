// src/server/config/environments/base.ts
export interface ServerConfigSettings {
    server: {
        port: number;
        host: string;
        apiUrl: string;
    };
    cors: {
        allowedOrigins: string[];
    };
    rateLimit: {
        windowMs: number;
        max: number;
    };
    auth: {
        jwtSecret: string;
        tokenExpiry: string;
    };
    db: {
        uri: string;
        options: {
            useNewUrlParser: boolean;
            useUnifiedTopology: boolean;
        };
    };
}