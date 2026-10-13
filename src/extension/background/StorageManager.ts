import { QueuedChange, ChangeMetadata } from './types';
import { detectBrowser, BrowserInfo } from './utils/browserDetect';

// masterId -> local browser id. localId null marks an applied delete (tombstone).
export interface MasterIdEntry {
    kind: 'bookmark' | 'folder';
    localId: string | null;
}
export type MasterIdMap = Record<string, MasterIdEntry>;

interface StorageData {
    masterIdMap?: MasterIdMap;
    pullFailure?: { since: number; attempts: number } | null;
    accounts?: Record<string, Partial<StorageData>>;
    notificationState?: any;
    pendingSnapshot?: { signature: string; operationId: string } | null;
    createIntents?: Record<string, any>;
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
    collectionId?: string | null;
    collectionName?: string | null;
    expectedEvents?: Array<{ eventId?: string; type: string; id?: string; title?: string; url?: string; parentId?: string; expires: number }>;
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

    // chrome.storage.local has no transactions, and the sync state is stored as one object. Every
    // read-modify-write of it runs through this chain, one at a time. Without it, two events that
    // overlap (a bookmark created while signing in) overwrite each other: a queued change or the
    // auth token is lost.
    private writeChain: Promise<unknown> = Promise.resolve();

    private exclusive<T>(task: () => Promise<T>): Promise<T> {
        const run = this.writeChain.then(task, task);
        this.writeChain = run.catch(() => undefined);
        return run;
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
        await this.setDefaults();
    }

    public async setDefaults(): Promise<void> {
        await this.exclusive(async () => {
            const current = await this.getData();
            await this.localSet({ ...this.defaults, ...current,
                settings: { ...this.defaults.settings, ...current?.settings },
                changes: current?.changes || [],
                deviceId: current?.deviceId || crypto.randomUUID(), browserInstanceId: current?.browserInstanceId || crypto.randomUUID(),
                suppressQueue: false });
        });
    }

    public async getData(): Promise<StorageData | null> {
        const data = await this.localGet(null);
        return Object.keys(data).length ? data as StorageData : null;
    }

    public async setData(data: StorageData): Promise<void> {
        await this.localSet(data as unknown as Record<string, any>);
    }

    public queueChange(change: { type: string; data: any }): Promise<void> {
        return this.exclusive(() => this.queueChangeUnlocked(change));
    }

    private async queueChangeUnlocked(change: { type: string; data: any }): Promise<void> {
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
            operationId: crypto.randomUUID(),
            collectionId: data.collectionId || null,
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

    public expectBookmarkEvent(event: { type: string; id?: string; title?: string; url?: string; parentId?: string }): Promise<string> {
        return this.exclusive(async () => {
            const data = await this.getData();
            const events = (data?.expectedEvents || []).filter(e => e.expires > Date.now());
            const eventId = crypto.randomUUID();
            events.push({ ...event, eventId, expires: Date.now() + 30000 });
            await this.localSet({ expectedEvents: events });
            return eventId;
        });
    }

    public cancelBookmarkEvent(eventId: string): Promise<void> {
        return this.exclusive(async () => {
            const data = await this.getData();
            await this.localSet({ expectedEvents: (data?.expectedEvents || []).filter(event => event.eventId !== eventId) });
        });
    }

    public consumeBookmarkEvent(type: string, id: string, node?: Partial<chrome.bookmarks.BookmarkTreeNode>): Promise<boolean> {
        return this.exclusive(async () => {
            const data = await this.getData();
            const events = (data?.expectedEvents || []).filter(e => e.expires > Date.now());
            const index = events.findIndex(e => e.type === type && (e.id ? e.id === id : e.title === node?.title && e.url === node?.url && e.parentId === node?.parentId));
            if (index < 0) return false;
            events.splice(index, 1);
            await this.localSet({ expectedEvents: events });
            return true;
        });
    }

    public setQueueingSuppressed(suppressed: boolean): Promise<void> {
        return this.exclusive(() => this.setQueueingSuppressedUnlocked(suppressed));
    }

    private async setQueueingSuppressedUnlocked(suppressed: boolean): Promise<void> {
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

    public freezeOutgoingChanges(changes: any[]): Promise<any[]> {
        return this.exclusive(async () => {
            const data = await this.getData();
            const frozen = changes.map(change => {
                const queued = data?.changes.find(item => item.operationId && item.operationId === change.operationId) as any;
                if (!queued) return change;
                queued.wireData ??= change.data;
                return { ...change, data: queued.wireData };
            });
            if (data) await this.localSet({ changes: data.changes });
            return frozen;
        });
    }

    public beginSnapshot(payload: any): Promise<string> {
        return this.exclusive(async () => {
            const data = await this.getData();
            const signature = JSON.stringify([data?.userId, data?.collectionId || null, payload]);
            const pending = data?.pendingSnapshot?.signature === signature ? data.pendingSnapshot : { signature, operationId: crypto.randomUUID() };
            await this.localSet({ pendingSnapshot: pending });
            return pending.operationId;
        });
    }

    public completeSnapshot(): Promise<void> {
        return this.exclusive(() => this.localSet({ pendingSnapshot: null }));
    }

    public async getCreateIntent(masterId: string): Promise<any> {
        return (await this.getData())?.createIntents?.[masterId];
    }

    public saveCreateIntent(masterId: string, intent: any): Promise<void> {
        return this.exclusive(async () => {
            const data = await this.getData();
            await this.localSet({ createIntents: { ...data?.createIntents, [masterId]: intent } });
        });
    }

    public finishMasterCreate(masterId: string, kind: 'folder' | 'bookmark', localId: string): Promise<void> {
        return this.exclusive(async () => {
            const data = await this.getData();
            const intents = { ...data?.createIntents };
            delete intents[masterId];
            await this.localSet({ createIntents: intents, masterIdMap: { ...data?.masterIdMap, [masterId]: { kind, localId } } });
        });
    }

    public cancelMasterCreate(masterId: string): Promise<void> {
        return this.exclusive(async () => {
            const data = await this.getData();
            const intents = { ...data?.createIntents };
            delete intents[masterId];
            await this.localSet({ createIntents: intents });
        });
    }

    public async getQueuedChangesCount(): Promise<number> {
        const data = await this.getData();
        return data?.changes?.length || 0;
    }

    public clearQueuedChanges(): Promise<void> {
        return this.exclusive(() => this.clearQueuedChangesUnlocked());
    }

    public removeQueuedChanges(sent: any[]): Promise<void> {
        return this.exclusive(async () => {
            const data = await this.getData();
            if (!data) return;
            const ids = new Set(sent.map(c => c.operationId).filter(Boolean));
            const legacy = new Set(sent.filter(c => !c.operationId).map(c => JSON.stringify(c)));
            data.changes = data.changes.filter(c => c.operationId ? !ids.has(c.operationId) : !legacy.has(JSON.stringify(c)));
            await this.localSet({ changes: data.changes });
        });
    }

    private async clearQueuedChangesUnlocked(): Promise<void> {
        const data = await this.getData();
        if (data) {
            data.changes = [];
            await this.setData(data);
        }
    }

    public updateLastSync(): Promise<void> {
        return this.exclusive(() => this.updateLastSyncUnlocked());
    }

    private async updateLastSyncUnlocked(): Promise<void> {
        const data = await this.getData();
        if (data) {
            data.lastSync = Date.now();
            await this.setData(data);
        }
    }

    // Local masterId -> browser id map, written after each apply. Later creates, updates and
    // deletes use it to find items the master no longer lists. A null localId is a tombstone:
    // the delete was applied, so a re-delivered delete does nothing.
    public async getMasterIdMap(): Promise<MasterIdMap> {
        const data = await this.localGet('masterIdMap');
        return (data.masterIdMap as MasterIdMap) || {};
    }

    public async setMasterIdMap(map: MasterIdMap): Promise<void> {
        await this.exclusive(() => this.localSet({ masterIdMap: map }));
    }

    // Retry count for a pull window that failed to apply cleanly. Keyed by the window start.
    public async getPullFailure(): Promise<{ since: number; attempts: number } | null> {
        const data = await this.localGet('pullFailure');
        return (data.pullFailure as { since: number; attempts: number } | null) || null;
    }

    public async saveReplacementBackup(backup: any): Promise<void> { await this.localSet({ replacementBackup: backup }); }
    public async getReplacementBackup(): Promise<any> { return (await this.localGet('replacementBackup')).replacementBackup; }

    public async setPullFailure(value: { since: number; attempts: number } | null): Promise<void> {
        await this.exclusive(() => this.localSet({ pullFailure: value }));
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

    public setBrowserInstanceId(id: string): Promise<void> {
        return this.exclusive(() => this.setBrowserInstanceIdUnlocked(id));
    }

    private async setBrowserInstanceIdUnlocked(id: string): Promise<void> {
        const data = await this.getData() || this.defaults;
        await this.setData({
            ...data,
            browserInstanceId: id
        });
        console.log('Set browserInstanceId:', id);
    }

    public async getCollectionId(): Promise<string | null> {
        const data = await this.getData();
        return data?.collectionId || null;
    }

    public async getCollectionName(): Promise<string> {
        const data = await this.getData();
        return data?.collectionName || 'Master Collection';
    }

    public setCollection(id: string | null, name: string): Promise<void> {
        return this.exclusive(() => this.setCollectionUnlocked(id, name));
    }

    private async setCollectionUnlocked(id: string | null, name: string): Promise<void> {
        const data = await this.getData() || this.defaults;
        await this.setData({
            ...data,
            ...((data.collectionId || null) !== (id || null) ? { masterIdMap: {}, pullFailure: null, lastSync: 0, notificationState: null } : {}),
            collectionId: id || null,
            collectionName: name
        });
        console.log('Set collection:', { id, name });
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

    public setAuth(auth: { token: string; user: { id: string; email: string; displayName: string | null } }): Promise<void> {
        return this.exclusive(() => this.setAuthUnlocked(auth));
    }

    private async setAuthUnlocked(auth: { token: string; user: { id: string; email: string; displayName: string | null } }): Promise<void> {
        const data = await this.getData() || this.defaults;
        const changedAccount = data.userId !== auth.user.id;
        const accounts = { ...data.accounts };
        if (changedAccount && data.userId) accounts[data.userId] = this.accountState(data);
        const restored = changedAccount ? accounts[auth.user.id] || {} : {};
        await this.setData({
            ...data,
            ...(changedAccount ? { changes: [], lastSync: 0, collectionId: null, collectionName: null,
                masterIdMap: {}, pullFailure: null, notificationState: null, pendingSnapshot: null, createIntents: {}, browserInstanceId: crypto.randomUUID(), ...restored } : {}),
            accounts,
            auth,
            userId: auth.user.id
        });
    }

    public clearAuth(): Promise<void> {
        return this.exclusive(() => this.clearAuthUnlocked());
    }

    private async clearAuthUnlocked(): Promise<void> {
        const data = await this.getData() || this.defaults;
        const accounts = { ...data.accounts };
        if (data.userId) accounts[data.userId] = this.accountState(data);
        await this.setData({
            ...data,
            accounts, changes: [], lastSync: 0, collectionId: null, collectionName: null,
            masterIdMap: {}, pullFailure: null, notificationState: null, pendingSnapshot: null, createIntents: {}, suppressQueue: false,
            auth: null,
            userId: ''
        });
    }

    private accountState(data: StorageData): Partial<StorageData> {
        return { changes: data.changes, lastSync: data.lastSync, collectionId: data.collectionId, collectionName: data.collectionName,
            masterIdMap: data.masterIdMap, pullFailure: data.pullFailure, pendingSnapshot: data.pendingSnapshot, createIntents: data.createIntents, browserInstanceId: data.browserInstanceId };
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
