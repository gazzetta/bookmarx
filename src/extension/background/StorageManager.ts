type ChangeType = 'CREATE' | 'UPDATE' | 'DELETE' | 'MOVE';

interface ChangeMetadata {
    timestamp: number;
    deviceInfo: {
        os: string;
        osVersion: string;
        browser: string;
        browserVersion: string;
        deviceId: string;
        browserInstanceId: string;
    };
    userAgent: string;
}

interface QueuedChange {
    type: string;
    data: any;
    timestamp: number;
    metadata: ChangeMetadata;
}

interface StorageData {
    changes: QueuedChange[];
    lastSync: number;
    settings: {
        syncInterval: number;
        autoSync: boolean;
    };
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
            metadata
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
        console.log('=== BookMarx Storage Debug ===');
        const data = await this.getData();
        console.log('Current Storage State:', {
            deviceId: data?.deviceId,
            browserInstanceId: data?.browserInstanceId,
            lastSync: data?.lastSync,
            settings: data?.settings,
            changesCount: data?.changes?.length || 0
        });
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
}

export async function debugStorage() {
    const storage = await chrome.storage.local.get(null);
    console.log('Current Storage State:', JSON.stringify(storage, null, 2));
}