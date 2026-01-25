```markdown
# BookMarx API Design

## API Standards
```typescript
interface APIStandards {
    baseUrl: "/api/v1";
    format: "JSON";
    authentication: "Bearer JWT";
    responses: {
        success: {
            status: 2XX;
            body: {
                success: true;
                data: any;
                timestamp: string; // ISO-8601
            };
        };
        error: {
            status: 4XX | 5XX;
            body: {
                success: false;
                error: {
                    code: string;
                    message: string;
                    details?: any;
                };
                timestamp: string; // ISO-8601
            };
        };
    };
}
```

## Authentication Endpoints

### Register
```typescript
POST /auth/register
{
    request: {
        email: string;
        password: string;
    };
    response: {
        userId: string;
        token: string;
    };
}
```

### Login
```typescript
POST /auth/login
{
    request: {
        email: string;
        password: string;
        deviceInfo: {
            id: string;
            browserName: string;
            browserVersion: string;
            os: string;
            osVersion: string;
        };
    };
    response: {
        userId: string;
        token: string;
        subscription: {
            type: 'free' | 'pro';
            expiresAt?: string;
        };
    };
}
```

### Social Auth
```typescript
POST /auth/{provider}  // google, apple, facebook
{
    request: {
        token: string;  // OAuth token
        deviceInfo: DeviceInfo;
    };
    response: {
        userId: string;
        token: string;
        isNewUser: boolean;
    };
}
```

## Bookmark Operations

### Get Bookmarks
```typescript
GET /bookmarks
{
    query: {
        folderId?: string;
        page?: number;
        limit?: number;
        search?: string;
    };
    response: {
        bookmarks: Bookmark[];
        pagination: {
            total: number;
            page: number;
            pageSize: number;
            hasMore: boolean;
        };
    };
}
```

### Create Bookmark
```typescript
POST /bookmarks
{
    request: {
        url: string;
        title: string;
        folderId?: string;
        description?: string;
        position?: number;
    };
    response: {
        bookmark: Bookmark;
    };
}
```

### Bulk Operations
```typescript
POST /bookmarks/bulk
{
    request: {
        operations: Array<{
            type: 'CREATE' | 'UPDATE' | 'DELETE' | 'MOVE';
            data: any;
        }>;
    };
    response: {
        results: Array<{
            success: boolean;
            id?: string;
            error?: string;
        }>;
        summary: {
            total: number;
            succeeded: number;
            failed: number;
        };
    };
}
```

## Sync Operations

### Start Sync
```typescript
POST /sync
{
    request: {
        deviceId: string;
        clientVersion: number;
        changes: {
            bookmarks: {
                created: Bookmark[];
                updated: Bookmark[];
                deleted: string[];
            };
            folders: {
                created: Folder[];
                updated: Folder[];
                deleted: string[];
            };
        };
    };
    response: {
        status: 'SUCCESS' | 'CONFLICT' | 'ERROR';
        changes: {
            bookmarks: Bookmark[];
            folders: Folder[];
            deleted: string[];
        };
        conflicts?: Conflict[];
        newVersion: number;
    };
}
```

### Resolve Conflicts
```typescript
POST /sync/resolve
{
    request: {
        resolutions: Array<{
            conflictId: string;
            choice: 'LOCAL' | 'REMOTE' | 'MERGE';
            mergeData?: any;
        }>;
    };
    response: {
        status: 'SUCCESS' | 'ERROR';
        results: Array<{
            conflictId: string;
            resolved: boolean;
            error?: string;
        }>;
    };
}
```

## Subscription & Payment

### Get Plans
```typescript
GET /subscription/plans
{
    response: {
        plans: Array<{
            id: string;
            name: string;
            price: number;
            currency: string;
            interval: 'month' | 'year' | 'lifetime';
            features: string[];
        }>;
    };
}
```

### Create Subscription
```typescript
POST /subscription/create
{
    request: {
        planId: string;
        paymentMethod: 'PAYPAL';
    };
    response: {
        subscriptionId: string;
        paymentUrl: string;  // PayPal checkout URL
    };
}
```

## Error Codes
```typescript
const ErrorCodes = {
    AUTH: {
        AUTH_001: "Invalid credentials",
        AUTH_002: "Token expired",
        AUTH_003: "Invalid social token",
        AUTH_004: "Email already registered"
    },
    BOOKMARK: {
        BM_001: "Invalid URL",
        BM_002: "Bookmark not found",
        BM_003: "Folder not found",
        BM_004: "Operation not permitted"
    },
    SYNC: {
        SYNC_001: "Version mismatch",
        SYNC_002: "Conflict detected",
        SYNC_003: "Invalid device ID",
        SYNC_004: "Sync in progress"
    },
    SUBSCRIPTION: {
        SUB_001: "Payment failed",
        SUB_002: "Invalid plan",
        SUB_003: "Subscription expired",
        SUB_004: "Feature not available in free plan"
    }
};
```

## Rate Limiting
```typescript
interface RateLimits {
    free: {
        requests: 100;
        period: "1 minute";
    };
    pro: {
        requests: 1000;
        period: "1 minute";
    };
    headers: {
        "X-RateLimit-Limit": string;
        "X-RateLimit-Remaining": string;
        "X-RateLimit-Reset": string;
    };
}
```

## WebSocket Events
```typescript
interface WebSocketEvents {
    SYNC_STARTED: "sync:started";
    SYNC_COMPLETED: "sync:completed";
    SYNC_FAILED: "sync:failed";
    BOOKMARK_UPDATED: "bookmark:updated";
    FOLDER_UPDATED: "folder:updated";
    SUBSCRIPTION_UPDATED: "subscription:updated";
    DEVICE_CONNECTED: "device:connected";
    DEVICE_DISCONNECTED: "device:disconnected";
}
```

## Security Headers
```typescript
const SecurityHeaders = {
    "Content-Security-Policy": "default-src 'self'",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Referrer-Policy": "strict-origin-when-cross-origin"
};
```

This API design provides:
1. RESTful endpoints
2. Clear request/response formats
3. Comprehensive error handling
4. Security measures
5. Rate limiting
6. Real-time capabilities
7. Scalability support
```