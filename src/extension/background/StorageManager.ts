type ChangeType = 'CREATE' | 'UPDATE' | 'DELETE' | 'MOVE';

interface ChangeMetadata {
    timestamp: number;
    deviceInfo: {
        os: string;
        osVersion: string;
        browser: string;
        browserVersion: string;
        deviceId: string;
    };
    userAgent: string;
}

interface QueuedChange {
    type: 'CREATE' | 'UPDATE' | 'DELETE' | 'MOVE';
    data: any;
    timestamp: number;
    metadata: ChangeMetadata;
}

interface StorageData {
    changes: QueuedChange[];  // Updated to use QueuedChange
    lastSync: number;
    settings: {
        syncInterval: number;
        autoSync: boolean;
    };
    deviceId?: string;
}

export class StorageManager {
    private defaults: StorageData = {
        changes: [],
        lastSync: 0,
        settings: {
            syncInterval: 5 * 60 * 1000, // 5 minutes
            autoSync: false
        }
    };

    public async initialize(): Promise<void> {
        const data = await this.getData();
        if (!data) {
            await this.setDefaults();
        }
    }

    public async setDefaults(): Promise<void> {
        await chrome.storage.local.set(this.defaults);
    }

    public async getData(): Promise<StorageData | null> {
        const data = await chrome.storage.local.get(null);
        return Object.keys(data).length ? data as StorageData : null;
    }

    public async queueChange(change: { type: ChangeType; data: any }): Promise<void> {
        const data = await this.getData() || this.defaults;
        
        // Get browser/system info
        const platformInfo = await this.getPlatformInfo();
        
        data.changes.push({
            ...change,
            timestamp: Date.now(),
            metadata: {
                timestamp: Date.now(),
                deviceInfo: {
                    os: platformInfo.os,
                    osVersion: platformInfo.osVersion,
                    browser: this.getBrowserInfo().name,
                    browserVersion: this.getBrowserInfo().version,
                    deviceId: await this.getOrCreateDeviceId()
                },
                userAgent: navigator.userAgent
            }
        });
        
        await chrome.storage.local.set(data);
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
        console.log('Storage Data:', JSON.stringify(data, null, 2));
    }   
    
    public async getDeviceId(): Promise<string> {
        const data = await this.getData();
        if (data?.deviceId) {
            return data.deviceId;
        }
        return '';
    }
}

export async function debugStorage() {
    const storage = await chrome.storage.local.get(null);
    console.log('Current Storage State:', JSON.stringify(storage, null, 2));
}