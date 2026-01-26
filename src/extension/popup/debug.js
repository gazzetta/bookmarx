function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(function() {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(function() {
            btn.textContent = originalText;
            btn.classList.remove('copied');
        }, 2000);
    }).catch(function(err) {
        console.error('Copy failed:', err);
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(function() {
                btn.textContent = originalText;
                btn.classList.remove('copied');
            }, 2000);
        } catch (e) {
            alert('Copy failed. Please select the text manually and copy.');
        }
        document.body.removeChild(textarea);
    });
}

function renderData(data) {
    const foldersJson = JSON.stringify(data.folders, null, 2);
    const rawTreeJson = JSON.stringify(data.rawTree, null, 2);
    const bookmarksJson = JSON.stringify(data.bookmarks, null, 2);

    let foldersTableRows = data.folders.map(f => `
        <tr class="${f.depth <= 1 ? 'highlight' : ''}">
            <td class="id">${escapeHtml(f.id)}</td>
            <td class="title depth-${Math.min(f.depth, 2)}">${escapeHtml(f.title || '(unnamed)')}</td>
            <td class="parent">${escapeHtml(f.parentId || '(none)')}</td>
            <td>${f.index ?? '-'}</td>
            <td>${f.depth}</td>
        </tr>
    `).join('');

    let bookmarksTableRows = data.bookmarks.map(b => `
        <tr>
            <td class="id">${escapeHtml(b.id)}</td>
            <td class="title">${escapeHtml(b.title || '(unnamed)')}</td>
            <td class="parent">${escapeHtml(b.parentId || '(none)')}</td>
            <td class="url">${escapeHtml(b.url)}</td>
        </tr>
    `).join('');

    document.getElementById('content').innerHTML = `
        <h1>BookMarx Debug - Bookmark Data Structure</h1>
        
        <div class="summary">
            <div class="summary-item"><span class="summary-label">Browser:</span> <span class="summary-value">${escapeHtml(JSON.stringify(data.browser))}</span></div>
            <div class="summary-item"><span class="summary-label">Timestamp:</span> <span class="summary-value">${escapeHtml(data.timestamp)}</span></div>
            <div class="summary-item"><span class="summary-label">Total Folders:</span> <span class="summary-value">${data.summary.totalFolders}</span></div>
            <div class="summary-item"><span class="summary-label">Total Bookmarks:</span> <span class="summary-value">${data.summary.totalBookmarks}</span></div>
        </div>

        <div class="note">
            <strong>Key IDs to look for:</strong><br>
            <strong>Chrome:</strong> "0" (root), "1" (Bookmarks Bar), "2" (Other Bookmarks)<br>
            <strong>Firefox:</strong> "root________", "toolbar_____" (Bookmarks Toolbar), "menu________" (Bookmarks Menu), "unfiled_____" (Other Bookmarks)
        </div>

        <h2>Folders (${data.folders.length} total)</h2>
        <p>These are the folders that would be sent to the server during sync/merge:</p>
        <table>
            <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Parent ID</th>
                <th>Index</th>
                <th>Depth</th>
            </tr>
            ${foldersTableRows}
        </table>

        <h2>Sample Bookmarks (first 50 of ${data.summary.totalBookmarks})</h2>
        <table>
            <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Parent ID</th>
                <th>URL</th>
            </tr>
            ${bookmarksTableRows}
        </table>

        <div class="json-section">
            <h2>Full Folder Data (for copying)</h2>
            <button class="copy-btn" id="copyFolders">Copy Folders JSON</button>
            <pre id="foldersJson">${escapeHtml(foldersJson)}</pre>
        </div>

        <div class="json-section">
            <h2>Raw Tree Structure (truncated)</h2>
            <button class="copy-btn" id="copyRawTree">Copy Tree JSON</button>
            <pre id="rawJson">${escapeHtml(rawTreeJson)}</pre>
        </div>

        <div class="json-section">
            <h2>Sample Bookmarks JSON</h2>
            <button class="copy-btn" id="copyBookmarks">Copy Bookmarks JSON</button>
            <pre id="bookmarksJson">${escapeHtml(bookmarksJson)}</pre>
        </div>
    `;

    // Add click handlers
    document.getElementById('copyFolders').addEventListener('click', function() {
        copyText(foldersJson, this);
    });
    document.getElementById('copyRawTree').addEventListener('click', function() {
        copyText(rawTreeJson, this);
    });
    document.getElementById('copyBookmarks').addEventListener('click', function() {
        copyText(bookmarksJson, this);
    });
}

// Load data from storage
chrome.storage.local.get('debugBookmarkData', function(result) {
    if (result.debugBookmarkData) {
        renderData(result.debugBookmarkData);
    } else {
        document.getElementById('content').innerHTML = '<h1>No debug data found</h1><p>Please click "Debug Bookmark Data" from the extension popup first.</p>';
    }
});
