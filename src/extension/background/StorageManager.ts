import { QueuedChange, ChangeMetadata } from './types';
import { detectBrowser, BrowserInfo } from './utils/browserDetect';

interface StorageData {
    changes: QueuedChange[];
    lastSync: number;
    settings: {
        syncInterval: number;
        autoSync: boolean;
    };
    suppressQueue?: boolean;
    userId: string;
    auth?: {
        token: string;
        user: {
            id: string;
            email: string;
            displayName: string | null;
        };
    } | null;
    deviceId?: string;
    browserInstanceId?: string;
}

export class StorageManager {
    private defaults: StorageData = {
        changes: [],
        lastSync: 0,
        settings: {
            syncInterval: 5 * 60 * 1000,
            autoSync: false
        },
        suppressQueue: false,
        userId: '',
        auth: null,
        deviceId: '',
        browserInstanceId: ''
    };

    private async localGet(keys: string | string[] | null): Promise<Record<string, any>> {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(keys as any, (items) => {
                const error = chrome.runtime.lastError;
                if (error) {
                    reject(new Error(error.message));
                    return;
                }
                resolve(items as Record<string, any>);
            });
        });
    }

    private async localSet(items: Record<string, any>): Promise<void> {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set(items, () => {
                const error = chrome.runtime.lastError;
                if (error) {
                    reject(new Error(error.message));
                    return;
                }
                resolve();
            });
        });
    }

    private async localClear(): Promise<void> {
        return new Promise((resolve, reject) => {
            chrome.storage.local.clear(() => {
                const error = chrome.runtime.lastError;
                if (error) {
                    reject(new Error(error.message));
                    return;
                }
                resolve();
            });
        });
    }

    public async initialize(): Promise<void> {
        const data = await this.getData();
        if (!data || !data.browserInstanceId) {
            await this.setDefaults();
        }
    }

    public async setDefaults(): Promise<void> {
        const deviceId = crypto.randomUUID();
        const browserInstanceId = crypto.randomUUID();
        const defaultsWithIds = {
            ...this.defaults,
            deviceId,
            browserInstanceId
        };
        await this.localSet(defaultsWithIds);
        console.log('Set defaults with deviceId and browserInstanceId:', { deviceId, browserInstanceId });
    }

    public async getData(): Promise<StorageData | null> {
        const data = await this.localGet(null);
        return Object.keys(data).length ? data as StorageData : null;
    }

    public async setData(data: StorageData): Promise<void> {
        await this.localSet(data as unknown as Record<string, any>);
    }

    public async queueChange(change: { type: string; data: any }): Promise<void> {
        const data = await this.getData() || this.defaults;
        const userId = await this.getUserId();
        const deviceId = await this.getDeviceId();
        const browserInstanceId = await this.getBrowserInstanceId();
        const browserInfo = await detectBrowser();

        const metadata: ChangeMetadata = {
            timestamp: Date.now(),
            deviceInfo: {
                browser: browserInfo.browser,
                browserVersion: browserInfo.browserVersion,
                deviceId,
                browserInstanceId,
                os: browserInfo.os,
                osVersion: browserInfo.osVersion
            },
            userAgent: navigator.userAgent
        };

        const queuedChange: QueuedChange = {
            ...change,
            timestamp: Date.now(),
            metadata,
            userId
        };

        data.changes.push(queuedChange);
        await this.setData(data);
    }

    public async isQueueingSuppressed(): Promise<boolean> {
        const data = await this.getData();
        return Boolean(data?.suppressQueue);
    }

    public async setQueueingSuppressed(suppressed: boolean): Promise<void> {
        const data = await this.getData() || this.defaults;
        data.suppressQueue = suppressed;
        await this.setData(data);
    }

    private async getPlatformInfo(): Promise<{os: string; osVersion: string}> {
        const platformInfo = await chrome.runtime.getPlatformInfo();
        const osVersion = navigator.platform;
        
        return {
            os: platformInfo.os,
            osVersion: osVersion
        };
    }
    
    private async getBrowserInfo(): Promise<BrowserInfo> {
        return detectBrowser();
    }
    
    private async getOrCreateDeviceId(): Promise<string> {
        const data = await this.getData();
        if (data?.deviceId) {
            return data.deviceId;
        }
        
        const deviceId = crypto.randomUUID();
        await this.localSet({ deviceId });
        return deviceId;
    }    

    public async getQueuedChanges(): Promise<Array<any>> {
        const data = await this.getData();
        return data?.changes || [];
    }

    public async getQueuedChangesCount(): Promise<number> {
        const data = await this.getData();
        return data?.changes?.length || 0;
    }

    public async clearQueuedChanges(): Promise<void> {
        const data = await this.getData();
        if (data) {
            data.changes = [];
            await this.setData(data);
        }
    }

    public async updateLastSync(): Promise<void> {
        const data = await this.getData();
        if (data) {
            data.lastSync = Date.now();
            await this.setData(data);
        }
    }

    public async debugCurrentState(): Promise<void> {
        console.group('=== BookMarx Storage Debug ===');
        const data = await this.getData();
        
        if (!data) {
            console.log('No storage data found');
            console.groupEnd();
            return;
        }

        console.log('User ID:', data.userId);
        console.log('Auth User:', data.auth?.user || null);
        console.log('Device ID:', data.deviceId);
        console.log('Browser Instance ID:', data.browserInstanceId);
        console.log('Last Sync:', data.lastSync ? new Date(data.lastSync).toISOString() : 'Never');
        console.log('Settings:', data.settings);
        console.log('Pending Changes:', data.changes?.length || 0);
        
        if (data.changes && data.changes.length > 0) {
            console.group('Queued Changes:');
            data.changes.forEach((change, index) => {
                console.group(`Change ${index + 1}:`);
                console.log('Type:', change.type);
                console.log('Data:', change.data);
                console.log('Timestamp:', new Date(change.timestamp).toISOString());
                console.log('User ID:', change.userId);
                console.groupEnd();
            });
            console.groupEnd();
        }
        
        console.groupEnd();
    }   
    
    public async getDeviceId(): Promise<string> {
        const data = await this.getData();
        if (data?.deviceId) {
            return data.deviceId;
        }
        // If no deviceId exists, create one
        const deviceId = crypto.randomUUID();
        await this.localSet({
            ...(data || this.defaults),
            deviceId
        } as unknown as Record<string, any>);
        console.log('Generated new deviceId:', deviceId);  // Debug log
        return deviceId;
    }

    public async getBrowserInstanceId(): Promise<string> {
        const data = await this.getData();
        const browserInstanceId = data?.browserInstanceId || '';
        console.log('Current browserInstanceId:', browserInstanceId);  // Debug log
        return browserInstanceId;
    }

    public async setBrowserInstanceId(id: string): Promise<void> {
        const data = await this.getData() || this.defaults;
        await this.setData({
            ...data,
            browserInstanceId: id
        });
        console.log('Set browserInstanceId:', id);
    }

    public async getUserId(): Promise<string> {
        const data = await this.getData();
        return data?.auth?.user?.id || data?.userId || '';
    }

    public async getAuth(): Promise<{ token: string; user: { id: string; email: string; displayName: string | null } } | null> {
        const data = await this.getData();
        return data?.auth || null;
    }

    public async getAuthToken(): Promise<string> {
        const auth = await this.getAuth();
        return auth?.token || '';
    }

    public async setAuth(auth: { token: string; user: { id: string; email: string; displayName: string | null } }): Promise<void> {
        const data = await this.getData() || this.defaults;
        await this.setData({
            ...data,
            auth,
            userId: auth.user.id
        });
    }

    public async clearAuth(): Promise<void> {
        const data = await this.getData() || this.defaults;
        await this.setData({
            ...data,
            auth: null,
            userId: ''
        });
    }

    public async clearAllStorage(): Promise<void> {
        await this.localClear();
        console.log('Storage cleared');
        // Reinitialize with defaults
        await this.setDefaults();
    }
}

export async function debugStorage() {
    const storage = await new Promise<Record<string, any>>((resolve, reject) => {
        chrome.storage.local.get(null, (items) => {
            const error = chrome.runtime.lastError;
            if (error) {
                reject(new Error(error.message));
                return;
            }
            resolve(items as Record<string, any>);
        });
    });
    console.log('Current Storage State:', JSON.stringify(storage, null, 2));
}
