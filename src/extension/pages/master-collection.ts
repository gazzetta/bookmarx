interface BookmarkNode {
    id: string;
    title: string;
    url?: string;
    children?: BookmarkNode[];
    parentId?: string;
    dateAdded?: number;
}

interface ApiResponse {
    success: boolean;
    data: BookmarkNode[];
    error?: {
        message: string;
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

    private async initialize(): Promise<void> {
        try {
            const userId = await this.getUserId();
            this.userInfo.textContent = `User ID: ${userId}`;
            
            console.log('Fetching master collection for user:', userId);
            const tree = await this.fetchMasterCollection(userId);
            console.log('Received tree data:', tree);
            this.renderTree(tree);
        } catch (error) {
            console.error('Failed to initialize master collection view:', error);
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
            this.showError(`Failed to load master collection: ${errorMessage}`);
        }
    }

    private async getUserId(): Promise<string> {
        try {
            const storage = await chrome.storage.local.get('userId');
            console.log('Retrieved userId from storage:', storage.userId);
            return storage.userId || '1';
        } catch (error) {
            console.error('Error getting userId:', error);
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
            console.error('Error getting userId:', errorMessage);
            return '1';
        }
    }

    private async fetchMasterCollection(userId: string): Promise<BookmarkNode[]> {
        try {
            const apiUrl = `http://localhost:3005/api/v1/bookmarks/tree/${userId}`;
            console.log('Fetching from:', apiUrl);
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include'
            });

            console.log('Response status:', response.status);
            
            // Log headers in a TypeScript-friendly way
            const headers: { [key: string]: string } = {};
            response.headers.forEach((value, key) => {
                headers[key] = value;
            });
            console.log('Response headers:', headers);

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

            if (!Array.isArray(responseData.data)) {
                console.error('Unexpected data format:', responseData.data);
                throw new Error('Server returned invalid data format');
            }

            return responseData.data;
        } catch (error) {
            console.error('Fetch error:', error);
            throw new Error(error instanceof Error ? error.message : 'Failed to fetch bookmarks');
        }
    }

    private async renderTree(nodes: BookmarkNode[], parentElement: HTMLElement = this.treeContainer): Promise<void> {
        console.log('Rendering tree with nodes:', nodes);
        
        if (!Array.isArray(nodes) || nodes.length === 0) {
            const userId = await this.getUserId();
            parentElement.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 20px;">
                    <h2 style="margin-bottom: 16px;">No Bookmarks Found</h2>
                    <p style="color: #666; margin-bottom: 12px;">
                        Your bookmark collection is empty. To get started:
                    </p>
                    <ol style="text-align: left; max-width: 400px; margin: 0 auto; line-height: 1.6;">
                        <li>Click the BookMarx extension icon in your browser</li>
                        <li>Select "Import Bookmarks" to import your existing browser bookmarks</li>
                        <li>Or create new bookmarks using the "Add Bookmark" button</li>
                    </ol>
                    <div style="margin-top: 16px; color: #888; font-size: 0.9em;">
                        User ID: ${userId}
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
                link.href = node.url;
                link.textContent = '- ' + node.title + ' (' + node.id + ')';
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                
                bookmarkDiv.appendChild(link);
                parentElement.appendChild(bookmarkDiv);
            } else {
                // Render folder
                const folderDiv = document.createElement('div');
                folderDiv.className = 'folder';
                
                const folderName = document.createElement('div');
                folderName.className = 'folder-name';
                folderName.innerHTML = `<span class="folder-icon">📂</span> ${node.title}`;
                
                const childrenDiv = document.createElement('div');
                childrenDiv.className = 'folder-children';
                
                folderDiv.appendChild(folderName);
                folderDiv.appendChild(childrenDiv);
                parentElement.appendChild(folderDiv);

                // Handle folder click
                folderName.addEventListener('click', () => {
                    childrenDiv.classList.toggle('collapsed');
                    const icon = folderName.querySelector('.folder-icon') as HTMLElement;
                    icon.textContent = childrenDiv.classList.contains('collapsed') ? '📁' : '📂';
                });

                // Render children if any
                if (node.children && Array.isArray(node.children) && node.children.length > 0) {
                    this.renderTree(node.children, childrenDiv);
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
