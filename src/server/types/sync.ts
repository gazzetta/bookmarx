// src/server/types/sync.ts
export interface DeviceInfo {
    browser: string;
    browserVersion: string;
    browserInstanceId: string;
    deviceId: string;
    os: string;
    osVersion: string;
}

export interface SyncMetadata {
    deviceInfo: DeviceInfo;
    userAgent: string;
    timestamp: number;
}

export interface BookmarkData {
    id: string;
    url: string;
    title: string;
    parentId: string;
    index: number;
    dateAdded: number;
    type?: 'bookmark';
}

export interface FolderData {
    id: string;
    title: string;
    parentId?: string;
    index: number;
    dateAdded: number;
    type?: 'folder';
}

export interface SyncChange {
    type: 'CREATE' | 'UPDATE' | 'DELETE';
    data: BookmarkData | FolderData;
    metadata: SyncMetadata;
    timestamp: number;
}

export interface SyncRequest {
    changes: SyncChange[];
    deviceId: string;
    timestamp: number;
}

export interface InitialSyncRequest {
    bookmarks: BookmarkData[];
    folders: FolderData[];
    deviceId: string;
    metadata: SyncMetadata;
}