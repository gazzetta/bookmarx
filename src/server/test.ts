import { db } from './db/database';

async function testDatabase() {
    try {
        // Test folder creation
        const folderResult = db.createFolder({
            browserId: 'test_folder_1',
            userId: 'test_user',
            title: 'Test Folder',
            parentId: null,
            position: 0,
            dateAdded: Date.now(),
            metadata: {
                deviceInfo: {
                    browser: 'Chrome',
                    browserVersion: '120.0',
                    deviceId: 'test_device',
                    os: 'Windows',
                    osVersion: '10'
                },
                userAgent: 'Test Agent',
                timestamp: Date.now()
            }
        });
        console.log('Folder created:', folderResult);

        // Test bookmark creation
        const bookmarkResult = db.createBookmark({
            browserId: 'test_bookmark_1',
            userId: 'test_user',
            url: 'https://example.com',
            title: 'Test Bookmark',
            parentId: 'test_folder_1',
            position: 0,
            dateAdded: Date.now(),
            metadata: {
                deviceInfo: {
                    browser: 'Chrome',
                    browserVersion: '120.0',
                    deviceId: 'test_device',
                    os: 'Windows',
                    osVersion: '10'
                },
                userAgent: 'Test Agent',
                timestamp: Date.now()
            }
        });
        console.log('Bookmark created:', bookmarkResult);

        // Test queries
        const folders = db.getFoldersByUserId('test_user');
        console.log('Folders:', folders);

        const bookmarks = db.getBookmarksByUserId('test_user');
        console.log('Bookmarks:', bookmarks);

        // Test sync history
        const syncResult = db.createSyncHistory({
            userId: 'test_user',
            deviceId: 'test_device',
            type: 'INITIAL_IMPORT',
            changesCount: 2,
            status: 'SUCCESS',
            details: {
                bookmarksProcessed: 1,
                foldersProcessed: 1,
                errors: []
            },
            metadata: {
                deviceInfo: {
                    browser: 'Chrome',
                    browserVersion: '120.0',
                    deviceId: 'test_device',
                    os: 'Windows',
                    osVersion: '10'
                },
                userAgent: 'Test Agent',
                timestamp: Date.now()
            }
        });
        console.log('Sync history created:', syncResult);

        const syncHistory = db.getSyncHistoryByUserId('test_user');
        console.log('Sync history:', syncHistory);

        console.log('All tests passed!');
    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        db.close();
    }
}

testDatabase();
