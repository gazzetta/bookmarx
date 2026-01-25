/**
 * Test script to simulate Chrome initial sync followed by Firefox merge
 * This tests the deduplication logic for folders and bookmarks
 */

import { db } from './db/database';

// Simulated Chrome bookmark structure (from WebExtensions API)
// Chrome uses numeric string IDs: "0" = root, "1" = Bookmarks Bar, "2" = Other Bookmarks
const chromeBookmarks = {
    folders: [
        { id: '1', browserId: '1', title: 'Bookmarks Bar', parentId: '0', position: 0, dateAdded: Date.now() },
        { id: '2', browserId: '2', title: 'Other Bookmarks', parentId: '0', position: 1, dateAdded: Date.now() },
        { id: '100', browserId: '100', title: 'Design', parentId: '1', position: 0, dateAdded: Date.now() },
        { id: '101', browserId: '101', title: 'Design2', parentId: '100', position: 0, dateAdded: Date.now() },
        { id: '102', browserId: '102', title: 'Work', parentId: '1', position: 1, dateAdded: Date.now() },
    ],
    bookmarks: [
        { id: 'b1', browserId: 'b1', title: 'LA Times', url: 'https://www.latimes.com/', parentId: '1', position: 0, dateAdded: Date.now() },
        { id: 'b2', browserId: 'b2', title: 'BF', url: 'https://bitcointalk.org/index.php?topic=1656416.msg27790672#msg27790672', parentId: '100', position: 0, dateAdded: Date.now() },
        { id: 'b3', browserId: 'b3', title: 'Tophatters', url: 'https://tophatters.co/collections/newdeals', parentId: '101', position: 0, dateAdded: Date.now() },
        { id: 'b4', browserId: 'b4', title: 'Work Doc', url: 'https://example.com/work', parentId: '102', position: 0, dateAdded: Date.now() },
    ]
};

// Simulated Firefox bookmark structure (from WebExtensions API)
// Firefox uses special IDs: toolbar_____, menu________, unfiled_____, etc.
// IMPORTANT: In Firefox, Bookmarks Toolbar's parent is menu________ (Bookmarks Menu)
const firefoxBookmarks = {
    folders: [
        // Firefox root structure - note the parent relationships
        { id: 'menu________', browserId: 'menu________', title: 'Bookmarks Menu', parentId: 'root________', position: 0, dateAdded: Date.now() },
        { id: 'toolbar_____', browserId: 'toolbar_____', title: 'Bookmarks Toolbar', parentId: 'menu________', position: 0, dateAdded: Date.now() },
        { id: 'unfiled_____', browserId: 'unfiled_____', title: 'Other Bookmarks', parentId: 'menu________', position: 1, dateAdded: Date.now() },
        { id: 'mobile______', browserId: 'mobile______', title: 'Mobile Bookmarks', parentId: 'root________', position: 1, dateAdded: Date.now() },
        // User folders - these should match Chrome's folders
        { id: 'ff100', browserId: 'ff100', title: 'Design', parentId: 'toolbar_____', position: 0, dateAdded: Date.now() },
        { id: 'ff101', browserId: 'ff101', title: 'Design2', parentId: 'ff100', position: 0, dateAdded: Date.now() },
        // New folder only in Firefox
        { id: 'ff200', browserId: 'ff200', title: 'Firefox Only Folder', parentId: 'toolbar_____', position: 1, dateAdded: Date.now() },
    ],
    bookmarks: [
        // Same bookmark as Chrome (should be deduplicated)
        { id: 'ffb1', browserId: 'ffb1', title: 'LA Times', url: 'https://www.latimes.com/', parentId: 'toolbar_____', position: 0, dateAdded: Date.now() },
        // Same bookmark in Design folder (should be deduplicated)
        { id: 'ffb2', browserId: 'ffb2', title: 'BF', url: 'https://bitcointalk.org/index.php?topic=1656416.msg27790672#msg27790672', parentId: 'ff100', position: 0, dateAdded: Date.now() },
        // Same bookmark in Design2 folder (should be deduplicated)
        { id: 'ffb3', browserId: 'ffb3', title: 'Tophatters', url: 'https://tophatters.co/collections/newdeals', parentId: 'ff101', position: 0, dateAdded: Date.now() },
        // New bookmark only in Firefox
        { id: 'ffb4', browserId: 'ffb4', title: 'Firefox Only Bookmark', url: 'https://firefox.com/', parentId: 'ff200', position: 0, dateAdded: Date.now() },
        // Same URL but different path (should NOT be deduplicated - different folder)
        { id: 'ffb5', browserId: 'ffb5', title: 'LA Times in Other', url: 'https://www.latimes.com/', parentId: 'unfiled_____', position: 0, dateAdded: Date.now() },
    ]
};

const TEST_USER_ID = 'test_merge_user_' + Date.now();

const chromeMetadata = {
    deviceInfo: {
        browser: 'Chrome',
        browserVersion: '120.0',
        browserInstanceId: 'chrome_instance_1',
        deviceId: 'test_device_chrome',
        os: 'Windows',
        osVersion: '10'
    },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
    timestamp: Date.now()
};

const firefoxMetadata = {
    deviceInfo: {
        browser: 'Firefox',
        browserVersion: '121.0',
        browserInstanceId: 'firefox_instance_1',
        deviceId: 'test_device_firefox',
        os: 'Windows',
        osVersion: '10'
    },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/121.0',
    timestamp: Date.now()
};

// Import the merge logic functions (we'll need to extract these or call the API)
// For now, let's simulate what the server does

async function simulateInitialSync(userId: string, bookmarkData: typeof chromeBookmarks, metadata: typeof chromeMetadata) {
    console.log('\n' + '='.repeat(60));
    console.log('SIMULATING INITIAL SYNC (Chrome)');
    console.log('='.repeat(60));

    // This simulates what /api/v1/sync/initial does
    const { folders, bookmarks } = bookmarkData;
    
    // Register browser
    db.registerBrowser({
        browserInstanceId: metadata.deviceInfo.browserInstanceId,
        userId,
        deviceId: metadata.deviceInfo.deviceId,
        browser: metadata.deviceInfo.browser,
        browserVersion: metadata.deviceInfo.browserVersion,
        os: metadata.deviceInfo.os,
        osVersion: metadata.deviceInfo.osVersion,
        userAgent: metadata.userAgent
    });

    let foldersCreated = 0;
    let bookmarksCreated = 0;
    const browserIdToMasterId = new Map<string, string>();

    // Create folders
    for (const folder of folders) {
        // Skip root folders
        if (folder.parentId === '0' || folder.id === '0') {
            console.log(`Skipping root folder: ${folder.title}`);
            continue;
        }

        let masterParentId: string | null = null;
        if (folder.parentId && folder.parentId !== '0') {
            masterParentId = browserIdToMasterId.get(folder.parentId) || null;
        }

        try {
            const result = db.createFolder({
                ...folder,
                masterParentId,
                userId,
                metadata
            });
            browserIdToMasterId.set(folder.id, result.masterId);
            foldersCreated++;
            console.log(`Created folder: ${folder.title} (${folder.id}) -> masterId: ${result.masterId}, masterParentId: ${masterParentId}`);
        } catch (err) {
            console.error(`Failed to create folder ${folder.title}:`, err);
        }
    }

    // Create bookmarks
    for (const bookmark of bookmarks) {
        let masterParentId: string | null = null;
        if (bookmark.parentId && bookmark.parentId !== '0') {
            masterParentId = browserIdToMasterId.get(bookmark.parentId) || null;
        }

        try {
            const result = db.createBookmark({
                ...bookmark,
                masterParentId,
                userId,
                metadata
            });
            bookmarksCreated++;
            console.log(`Created bookmark: ${bookmark.title} -> ${bookmark.url} (parentId: ${masterParentId})`);
        } catch (err) {
            console.error(`Failed to create bookmark ${bookmark.title}:`, err);
        }
    }

    console.log(`\nInitial sync complete: ${foldersCreated} folders, ${bookmarksCreated} bookmarks created`);
    return { foldersCreated, bookmarksCreated };
}

async function runMergeTest() {
    console.log('\n' + '#'.repeat(60));
    console.log('BOOKMARK MERGE TEST');
    console.log('#'.repeat(60));
    console.log(`Test User ID: ${TEST_USER_ID}`);

    try {
        // Step 1: Initial sync with Chrome bookmarks
        const initialResult = await simulateInitialSync(TEST_USER_ID, chromeBookmarks, chromeMetadata);

        // Show what's in the database after initial sync
        console.log('\n' + '='.repeat(60));
        console.log('DATABASE STATE AFTER INITIAL SYNC');
        console.log('='.repeat(60));
        
        const foldersAfterInitial = db.getFoldersByUserId(TEST_USER_ID);
        console.log('\nFolders:');
        for (const f of foldersAfterInitial) {
            console.log(`  - ${f.title} (masterId: ${f.masterId}, browserId: ${f.browserId}, masterParentId: ${f.masterParentId})`);
        }

        const bookmarksAfterInitial = db.getBookmarksByUserId(TEST_USER_ID);
        console.log('\nBookmarks:');
        for (const b of bookmarksAfterInitial) {
            console.log(`  - ${b.title}: ${b.url} (masterParentId: ${b.masterParentId})`);
        }

        // Step 2: Now simulate the merge from Firefox
        // This requires calling the actual merge endpoint logic
        // For now, let's make an HTTP request to the running server
        
        console.log('\n' + '='.repeat(60));
        console.log('SIMULATING MERGE (Firefox) via API');
        console.log('='.repeat(60));
        console.log('Note: Server must be running on localhost:3005');
        console.log('Firefox folders being sent:');
        for (const f of firefoxBookmarks.folders) {
            console.log(`  - ${f.title} (id: ${f.id}, parentId: ${f.parentId})`);
        }
        console.log('\nFirefox bookmarks being sent:');
        for (const b of firefoxBookmarks.bookmarks) {
            console.log(`  - ${b.title}: ${b.url} (parentId: ${b.parentId})`);
        }

        // Call the merge API endpoint
        // We'll use a test token that bypasses auth for local testing
        const mergePayload = {
            folders: firefoxBookmarks.folders,
            bookmarks: firefoxBookmarks.bookmarks,
            metadata: firefoxMetadata
        };

        try {
            const response = await fetch('http://localhost:3005/api/v1/sync/merge', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer test_token_${TEST_USER_ID}`,
                    'X-Test-User-Id': TEST_USER_ID  // For test bypass
                },
                body: JSON.stringify(mergePayload)
            });

            console.log(`\nMerge API Response Status: ${response.status}`);
            const responseData = await response.json();
            console.log('Merge API Response:', JSON.stringify(responseData, null, 2));

            // Show database state after merge
            console.log('\n' + '='.repeat(60));
            console.log('DATABASE STATE AFTER MERGE');
            console.log('='.repeat(60));
            
            const foldersAfterMerge = db.getFoldersByUserId(TEST_USER_ID);
            console.log('\nFolders after merge:');
            for (const f of foldersAfterMerge) {
                console.log(`  - ${f.title} (masterId: ${f.masterId}, browserId: ${f.browserId}, masterParentId: ${f.masterParentId})`);
            }

            const bookmarksAfterMerge = db.getBookmarksByUserId(TEST_USER_ID);
            console.log('\nBookmarks after merge:');
            for (const b of bookmarksAfterMerge) {
                console.log(`  - ${b.title}: ${b.url} (masterParentId: ${b.masterParentId})`);
            }

            // Verify results
            console.log('\n' + '='.repeat(60));
            console.log('VERIFICATION');
            console.log('='.repeat(60));
            
            const expectedFolderCount = 4; // Design, Design2, Work, Firefox Only Folder
            const expectedBookmarkCount = 6; // LA Times, BF, Tophatters, Work Doc, Firefox Only Bookmark, LA Times in Other
            
            const actualFolderCount = foldersAfterMerge.length;
            const actualBookmarkCount = bookmarksAfterMerge.length;
            
            console.log(`\nExpected folders: ${expectedFolderCount}, Actual: ${actualFolderCount} - ${actualFolderCount === expectedFolderCount ? 'PASS' : 'FAIL'}`);
            console.log(`Expected bookmarks: ${expectedBookmarkCount}, Actual: ${actualBookmarkCount} - ${actualBookmarkCount === expectedBookmarkCount ? 'PASS' : 'FAIL'}`);
            
            // Check specific folders exist
            const folderTitles = foldersAfterMerge.map(f => f.title);
            console.log('\nFolder verification:');
            console.log(`  - Design exists: ${folderTitles.includes('Design') ? 'PASS' : 'FAIL'}`);
            console.log(`  - Design2 exists: ${folderTitles.includes('Design2') ? 'PASS' : 'FAIL'}`);
            console.log(`  - Work exists: ${folderTitles.includes('Work') ? 'PASS' : 'FAIL'}`);
            console.log(`  - Firefox Only Folder exists: ${folderTitles.includes('Firefox Only Folder') ? 'PASS' : 'FAIL'}`);
            console.log(`  - No duplicate Design: ${folderTitles.filter(t => t === 'Design').length === 1 ? 'PASS' : 'FAIL'}`);
            console.log(`  - No duplicate Design2: ${folderTitles.filter(t => t === 'Design2').length === 1 ? 'PASS' : 'FAIL'}`);

        } catch (fetchError) {
            console.error('Failed to call merge API:', fetchError);
            console.log('\nMake sure the server is running: npx ts-node server.ts');
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('EXPECTED RESULTS (for reference)');
        console.log('='.repeat(60));
        console.log(`
FOLDERS:
- "Bookmarks Menu" (menu________) -> Should be SKIPPED (container)
- "Bookmarks Toolbar" (toolbar_____) -> Should be SKIPPED (maps to "bookmarks bar")
- "Other Bookmarks" (unfiled_____) -> Should be SKIPPED (maps to "other bookmarks")
- "Mobile Bookmarks" (mobile______) -> Should be SKIPPED (maps to "mobile bookmarks")
- "Design" (ff100, parent: toolbar_____) -> Path: "bookmarks bar/design" -> Should MATCH Chrome's Design -> SKIP
- "Design2" (ff101, parent: ff100) -> Path: "bookmarks bar/design/design2" -> Should MATCH Chrome's Design2 -> SKIP
- "Firefox Only Folder" (ff200, parent: toolbar_____) -> Path: "bookmarks bar/firefox only folder" -> NEW -> CREATE

BOOKMARKS:
- "LA Times" in toolbar_____ -> Path: "bookmarks bar|https://www.latimes.com/" -> Should MATCH -> SKIP
- "BF" in ff100 (Design) -> Path: "bookmarks bar/design|https://bitcointalk.org/..." -> Should MATCH -> SKIP
- "Tophatters" in ff101 (Design2) -> Path: "bookmarks bar/design/design2|https://tophatters.co/..." -> Should MATCH -> SKIP
- "Firefox Only Bookmark" in ff200 -> Path: "bookmarks bar/firefox only folder|https://firefox.com/" -> NEW -> CREATE
- "LA Times in Other" in unfiled_____ -> Path: "other bookmarks|https://www.latimes.com/" -> DIFFERENT PATH -> CREATE

SUMMARY:
- Folders: 1 created, 6 skipped
- Bookmarks: 2 created, 3 skipped
`);

        // Cleanup test data
        console.log('\n' + '='.repeat(60));
        console.log('CLEANUP');
        console.log('='.repeat(60));
        // Note: In a real test, we'd clean up the test user's data
        console.log('Test data remains in database for inspection.');
        console.log(`To clean up manually, delete all records with userId: ${TEST_USER_ID}`);

    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
runMergeTest().then(() => {
    console.log('\nTest script completed.');
    // Don't close db - let it be inspected
    // db.close();
}).catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
