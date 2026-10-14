import { API_BASE_URL, WEBSITE_BASE_URL } from '../config';

interface BookmarkNode {
    id: string;
    title: string;
    url?: string;
    children?: BookmarkNode[];
    parentId?: string;
    dateAdded?: number;
    createdAt?: number;
    updatedAt?: number;
    sourceBrowser?: string;
    sessionId?: string;
    type?: 'folder' | 'bookmark';
    browserId?: string;
}

interface ApiResponse {
    success: boolean;
    data: BookmarkNode[];
    error?: {
        message: string;
    };
}

interface AuthState {
    token: string;
    user: {
        id: string;
        email: string;
        displayName: string | null;
        isPremium?: boolean;
        subscriptionTier?: string;
    };
}

class MasterCollectionView {
    private treeContainer: HTMLElement;
    private userInfo: HTMLElement;

    constructor() {
        this.treeContainer = document.getElementById('bookmarkTree') as HTMLElement;
        this.userInfo = document.getElementById('user-info') as HTMLElement;
        this.initialize();
    }

    private formatDate(value?: number): string {
        if (value === undefined || value === null) {
            return 'N/A';
        }

        const normalized = value < 1_000_000_000_000 ? value * 1000 : value;
        const date = new Date(normalized);
        if (Number.isNaN(date.getTime())) {
            return 'Invalid date';
        }

        return date.toLocaleString(undefined, { timeZoneName: 'short' });
    }

    private async initialize(): Promise<void> {
        try {
            const auth = await this.getAuth();
            if (!auth) {
                this.showError('Please sign in from the extension popup first.');
                return;
            }

            const userId = auth.user.id;
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const isPremium = auth.user.isPremium || auth.user.subscriptionTier === 'premium';

            this.userInfo.textContent = `Signed in: ${auth.user.email} • Times shown in: ${timeZone} • `;
            const link = document.createElement('a');
            link.href = `${WEBSITE_BASE_URL}/${isPremium ? 'collections/default/edit' : 'settings/subscription'}`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = isPremium ? 'Edit in Web' : 'Upgrade to Edit';
            this.userInfo.appendChild(link);

            console.log('Fetching master collection for user:', userId);
            const tree = await this.fetchMasterCollection(userId, auth.token);
            console.log('Received tree data:', tree);
            this.renderTree(tree);
        } catch (error) {
            console.error('Failed to initialize master collection view:', error);
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
            this.showError(`Failed to load master collection: ${errorMessage}`);
        }
    }

    private async getAuth(): Promise<AuthState | null> {
        // Always use message-based approach for cross-browser compatibility
        // Extension pages in Firefox may not have direct storage access
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getAuthState' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error getting auth via message:', chrome.runtime.lastError);
                    resolve(null);
                    return;
                }
                console.log('Got auth response:', response);
                resolve(response?.auth || null);
            });
        });
    }

    private async fetchMasterCollection(userId: string, token: string): Promise<BookmarkNode[]> {
        try {
            // Get current collection ID from storage
            const collectionId = await new Promise<string | null>((resolve) => {
                chrome.runtime.sendMessage({ action: 'getCurrentCollection' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error getting collection ID:', chrome.runtime.lastError);
                        resolve(null);
                        return;
                    }
                    resolve(response?.data?.collectionId || null);
                });
            });

            // Get device ID from storage
            const deviceId = await new Promise<string | null>((resolve) => {
                chrome.runtime.sendMessage({ action: 'getDeviceId' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error getting device ID:', chrome.runtime.lastError);
                        resolve(null);
                        return;
                    }
                    resolve(response?.data?.deviceId || null);
                });
            });

            const apiUrl = `${API_BASE_URL}/api/v1/sync/master-collection`;
            console.log('Fetching from:', apiUrl, 'with collection ID:', collectionId, 'device ID:', deviceId);

            const headers: { [key: string]: string } = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-User-ID': userId
            };

            // Add device ID header if available (required by API)
            if (deviceId) {
                headers['X-Device-ID'] = deviceId;
            }

            // Add collection ID header if available
            if (collectionId) {
                headers['X-Collection-ID'] = collectionId;
            }

            const response = await fetch(apiUrl, {
                method: 'GET',
                headers,
                credentials: 'include'
            });

            console.log('Response status:', response.status);

            // Log headers in a TypeScript-friendly way
            const responseHeaders: { [key: string]: string } = {};
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });
            console.log('Response headers:', responseHeaders);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server response not OK:', response.status, errorText);
                throw new Error(`Server returned ${response.status}: ${errorText}`);
            }

            const responseText = await response.text();
            console.log('Raw response:', responseText);

            let responseData: ApiResponse;
            try {
                responseData = JSON.parse(responseText);
            } catch (e) {
                console.error('Failed to parse JSON:', e);
                throw new Error('Invalid JSON response from server');
            }

            console.log('Parsed response:', responseData);

            if (!responseData.success) {
                throw new Error(responseData.error?.message || 'API returned error status');
            }

            // API returns {folders, bookmarks, timestamp} - need to convert to tree
            const apiData = responseData.data;
            if (!apiData || typeof apiData !== 'object') {
                console.error('Unexpected data format:', apiData);
                throw new Error('Server returned invalid data format');
            }

            const { folders, bookmarks } = apiData as { folders?: any[], bookmarks?: any[] };
            if (!Array.isArray(folders) || !Array.isArray(bookmarks)) {
                console.error('Expected folders and bookmarks arrays:', apiData);
                throw new Error('Server returned invalid data format');
            }

            // Convert to tree structure
            const tree: BookmarkNode[] = [];
            
            // Create folder map
            const folderMap = new Map<string, BookmarkNode>();
            for (const folder of folders) {
                const node: BookmarkNode = {
                    id: folder.masterId,
                    title: folder.title,
                    dateAdded: folder.createdAt,
                    children: [],
                    type: 'folder'
                };
                folderMap.set(folder.masterId, node);
            }

            // Add bookmarks to their parent folders
            for (const bookmark of bookmarks) {
                const node: BookmarkNode = {
                    id: bookmark.masterId,
                    title: bookmark.title,
                    url: bookmark.url,
                    dateAdded: bookmark.createdAt,
                    type: 'bookmark',
                    browserId: bookmark.browserId
                };
                
                const parentFolder = folderMap.get(bookmark.masterParentId || '');
                if (parentFolder) {
                    parentFolder.children!.push(node);
                } else {
                    // Root-level bookmark
                    tree.push(node);
                }
            }

            // Build folder hierarchy
            for (const folder of folders) {
                const node = folderMap.get(folder.masterId);
                if (!node) continue;

                const parentId = folder.masterParentId;
                if (parentId && folderMap.has(parentId)) {
                    folderMap.get(parentId)!.children!.push(node);
                } else {
                    // Root-level folder
                    tree.push(node);
                }
            }

            return tree;
        } catch (error) {
            console.error('Fetch error:', error);
            throw new Error(error instanceof Error ? error.message : 'Failed to fetch bookmarks');
        }
    }

    private async renderTree(nodes: BookmarkNode[], parentElement: HTMLElement = this.treeContainer): Promise<void> {
        console.log('Rendering tree with nodes:', nodes);

        if (!Array.isArray(nodes) || nodes.length === 0) {
            parentElement.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <div class="empty-text">No Bookmarks Found</div>
                    <p style="color: #94a3b8; margin: 12px 0;">
                        Your bookmark collection is empty.
                    </p>
                    <div style="margin-top: 16px; color: #cbd5e1; font-size: 0.8em; font-family: monospace;">
                        Your bookmarks will appear after a successful sync.
                    </div>
                </div>
            `;
            return;
        }

        nodes.forEach(node => {
            if (!node || typeof node !== 'object') {
                console.warn('Invalid node:', node);
                return;
            }

            if (node.url) {
                // Render bookmark
                const bookmarkDiv = document.createElement('div');
                bookmarkDiv.className = 'bookmark';

                const link = document.createElement('a');
                if (/^(https?|ftp):/i.test(node.url)) link.href = node.url;
                else link.setAttribute('title', 'This URL can be used from your browser bookmarks or exported backup.');
                link.className = 'bookmark-link';
                link.target = '_blank';
                link.rel = 'noopener noreferrer';

                // Icon
                const icon = document.createElement('div');
                icon.className = 'bookmark-icon';
                icon.textContent = '🔖'; // Could be replaced with favicon image if available

                // Info (Title + URL)
                const info = document.createElement('div');
                info.className = 'bookmark-info';

                const title = document.createElement('div');
                title.className = 'bookmark-title';
                title.textContent = node.title || 'Untitled';

                const url = document.createElement('div');
                url.className = 'bookmark-url';
                // Remove protocol for cleaner display
                url.textContent = node.url.replace(/^https?:\/\/(www\.)?/, '');

                info.appendChild(title);
                info.appendChild(url);

                // Meta (Source + Dates)
                const meta = document.createElement('div');
                meta.className = 'bookmark-meta';

                // Format browser name with proper capitalization
                if (node.sourceBrowser) {
                    const browserName = node.sourceBrowser.charAt(0).toUpperCase() + node.sourceBrowser.slice(1);
                    const browserPill = document.createElement('span');
                    browserPill.className = 'pill';
                    browserPill.textContent = browserName;
                    meta.appendChild(browserPill);
                    meta.appendChild(document.createElement('br'));
                }

                const dbAdded = this.formatDate(node.createdAt);

                const dateInfo = document.createElement('span');
                // dateInfo.innerHTML = `Added: ${dbAdded}`;
                // Simplified meta for cleaner look, hover for details? 
                // For now keeping it simple
                dateInfo.textContent = dbAdded.split(',')[0]; // Just the date
                meta.appendChild(document.createTextNode(' '));
                meta.appendChild(dateInfo);

                link.appendChild(icon);
                link.appendChild(info);
                link.appendChild(meta);

                bookmarkDiv.appendChild(link);
                parentElement.appendChild(bookmarkDiv);
            } else {
                // Render folder
                const folderDiv = document.createElement('div');
                folderDiv.className = 'folder';

                const folderName = document.createElement('div');
                folderName.className = 'folder-name';

                const icon = document.createElement('div');
                icon.className = 'folder-icon';
                icon.textContent = '📁';

                const title = document.createElement('div');
                title.className = 'folder-title';
                title.textContent = node.title || 'Untitled';

                // Optional: Count (not available in node currently without calculation)

                folderName.appendChild(icon);
                folderName.appendChild(title);

                const childrenDiv = document.createElement('div');
                childrenDiv.className = 'folder-children';

                // Folders default to expanded or based on preference? 
                // Defaulting to expanded for now

                folderDiv.appendChild(folderName);
                folderDiv.appendChild(childrenDiv);
                parentElement.appendChild(folderDiv);

                // Handle folder click
                folderName.addEventListener('click', (e) => {
                    e.stopPropagation();
                    childrenDiv.classList.toggle('collapsed');
                    const isCollapsed = childrenDiv.classList.contains('collapsed');
                    icon.textContent = isCollapsed ? '📁' : '📂';
                    folderName.style.opacity = isCollapsed ? '0.7' : '1';
                });

                // Render children if any
                if (node.children && Array.isArray(node.children) && node.children.length > 0) {
                    this.renderTree(node.children, childrenDiv);
                } else {
                    // Empty folder indicator?
                    // childrenDiv.innerHTML = '<div style="padding: 8px 16px; color: #cbd5e1; font-size: 0.8em; font-style: italic;">Empty</div>';
                }
            }
        });
    }

    private showError(message: string): void {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.color = 'red';
        errorDiv.style.padding = '10px';
        errorDiv.textContent = message;
        this.treeContainer.appendChild(errorDiv);
    }
}

// Initialize the view
new MasterCollectionView();
