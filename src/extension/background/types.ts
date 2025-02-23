export interface QueuedChange {
    type: string;
    data: any;
    timestamp: number;
    metadata: ChangeMetadata;
    userId: string;  // Add this line
}

export interface ChangeMetadata {
    timestamp: number;
    deviceInfo: {
        browser: string;
        browserVersion: string;
        deviceId: string;
        browserInstanceId: string;
        os: string;
        osVersion: string;
    };
    userAgent: string;
}