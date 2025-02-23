import { QueuedChange, ChangeMetadata } from './types';

interface StorageData {
    changes: QueuedChange[];
    lastSync: number;
    settings: {
        syncInterval: number;
        autoSync: boolean;
    };
    userId: string;
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
        userId: '1',
        deviceId: '',
        browserInstanceId: ''
    };

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
        await chrome.storage.local.set(defaultsWithIds);
        console.log('Set defaults with deviceId and browserInstanceId:', { deviceId, browserInstanceId });
    }

    public async getData(): Promise<StorageData | null> {
        const data = await chrome.storage.local.get(null);
        return Object.keys(data).length ? data as StorageData : null;
    }

    public async setData(data: StorageData): Promise<void> {
        await chrome.storage.local.set(data);
    }

    public async queueChange(change: { type: string; data: any }): Promise<void> {
        const data = await this.getData() || this.defaults;
        const userId = await this.getUserId();
        const deviceId = await this.getDeviceId();
        const browserInstanceId = await this.getBrowserInstanceId();
        const { name: browser, version: browserVersion } = this.getBrowserInfo();

        const metadata: ChangeMetadata = {
            timestamp: Date.now(),
            deviceInfo: {
                browser,
                browserVersion,
                deviceId,
                browserInstanceId,
                os: navigator.platform,
                osVersion: navigator.userAgent
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

    private async getPlatformInfo(): Promise<{os: string; osVersion: string}> {
        const platformInfo = await chrome.runtime.getPlatformInfo();
        const osVersion = navigator.platform;
        
        return {
            os: platformInfo.os,
            osVersion: osVersion
        };
    }
    
    private getBrowserInfo(): {name: string; version: string} {
        const userAgent = navigator.userAgent;
        const browserData = {
            name: 'unknown',
            version: 'unknown'
        };
    
        if (userAgent.includes('Chrome')) {
            browserData.name = 'Chrome';
            const match = userAgent.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
            if (match) browserData.version = match[1];
        }
        // Add other browser detections as needed
    
        return browserData;
    }
    
    private async getOrCreateDeviceId(): Promise<string> {
        const data = await this.getData();
        if (data?.deviceId) {
            return data.deviceId;
        }
        
        const deviceId = crypto.randomUUID();
        await chrome.storage.local.set({ deviceId });
        return deviceId;
    }    

    public async getQueuedChanges(): Promise<Array<any>> {
        const data = await this.getData();
        return data?.changes || [];
    }

    public async clearQueuedChanges(): Promise<void> {
        const data = await this.getData();
        if (data) {
            data.changes = [];
            await chrome.storage.local.set(data);
        }
    }

    public async updateLastSync(): Promise<void> {
        const data = await this.getData();
        if (data) {
            data.lastSync = Date.now();
            await chrome.storage.local.set(data);
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
        await chrome.storage.local.set({ 
            ...data || this.defaults,
            deviceId 
        });
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
        return data?.userId || '1';
    }
}

export async function debugStorage() {
    const storage = await chrome.storage.local.get(null);
    console.log('Current Storage State:', JSON.stringify(storage, null, 2));
}
