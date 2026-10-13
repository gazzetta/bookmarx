import { Parser } from 'htmlparser2';

export interface BookmarkFileItem {
    type: 'folder' | 'bookmark'; title: string; url?: string; children?: BookmarkFileItem[];
    rootKind?: string; dateAdded?: number; position?: number;
}
const roles = new Set(['bar', 'other', 'mobile', 'menu', 'imported', 'unsorted']);
export function safeBookmarkUrl(value: unknown): string {
    if (typeof value !== 'string' || value.length > 100000 || !value.trim()) throw new Error('A valid bookmark URL is required');
    const url = value.trim();
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error(`Invalid bookmark URL: ${url.slice(0, 100)}`); }
    if (!['http:', 'https:', 'ftp:', 'file:', 'javascript:', 'chrome:', 'edge:', 'opera:', 'about:'].includes(parsed.protocol)) throw new Error(`Unsupported bookmark protocol: ${parsed.protocol}`);
    return url;
}
export function validateBookmarkItems(items: unknown): { items: BookmarkFileItem[]; bookmarks: number; folders: number } {
    if (!Array.isArray(items)) throw new Error('A bookmark tree is required');
    let bookmarks = 0, folders = 0;
    const visit = (nodes: any[], depth: number): BookmarkFileItem[] => {
        if (depth > 128) throw new Error('Bookmark folders are nested too deeply (maximum 128)');
        return nodes.map(node => {
            if (!node || typeof node.title !== 'string' || node.title.length > 10000) throw new Error('Invalid bookmark title');
            if (++folders + bookmarks > 50000) throw new Error('Import contains too many items (maximum 50,000)');
            const common = { title: node.title, ...(Number.isFinite(node.dateAdded) ? { dateAdded: node.dateAdded } : {}),
                ...(Number.isInteger(node.position) && node.position >= 0 ? { position: node.position } : {}) };
            if (node.type === 'bookmark') {
                folders--; bookmarks++;
                return { ...common, type: 'bookmark', url: safeBookmarkUrl(node.url) };
            }
            if (node.type !== 'folder' || !Array.isArray(node.children)) throw new Error('Invalid folder or children');
            if (node.rootKind !== undefined && (!roles.has(node.rootKind) || depth !== 0)) throw new Error('Invalid native folder role');
            return { ...common, type: 'folder', ...(node.rootKind ? { rootKind: node.rootKind } : {}), children: visit(node.children, depth + 1) };
        });
    };
    return { items: visit(items, 0), bookmarks, folders };
}

export function parseBookmarkFile(content: string, format: 'html' | 'json' | 'text'): ReturnType<typeof validateBookmarkItems> {
    if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > 8 * 1024 * 1024 || !content.trim()) throw new Error('Choose a nonempty bookmark file of at most 8 MB');
    if (format === 'json') {
        const data = JSON.parse(content);
        if (data.format !== 'bookmarx' || data.version !== 1) throw new Error('This is not a supported BookMarx JSON backup');
        return validateBookmarkItems(data.items);
    }
    if (format === 'text') {
        const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        return validateBookmarkItems(lines.map(line => {
            const separator = line.indexOf('\t');
            const url = separator < 0 ? line : line.slice(separator + 1);
            return { type: 'bookmark', title: separator < 0 ? url : line.slice(0, separator), url };
        }));
    }
    if (format !== 'html' || !/<a\b|<h3\b|NETSCAPE-Bookmark-file/i.test(content)) throw new Error('Choose a Netscape bookmark HTML file, JSON backup, or a list of URLs');
    const roots: BookmarkFileItem[] = [];
    let target = roots;
    const stack: BookmarkFileItem[][] = [];
    let pendingFolder: BookmarkFileItem | undefined;
    let capture: { tag: string; attributes: Record<string, string>; text: string } | undefined;
    let count = 0;
    let openLists = 0;
    const parser = new Parser({
        onopentag(name, attributes) {
            if (name === 'dt') pendingFolder = undefined;
            if (name === 'h3' || name === 'a') capture = { tag: name, attributes, text: '' };
            if (name === 'dl') {
                if (++openLists > 128) throw new Error('Bookmark folders are nested too deeply');
                stack.push(target);
                if (pendingFolder) { target = pendingFolder.children!; pendingFolder = undefined; }
            }
        },
        ontext(text) { if (capture) capture.text += text; },
        onclosetag(name) {
            if (capture?.tag === name) {
                if (++count > 50000) throw new Error('Import contains too many items');
                const date = Number(capture.attributes.add_date);
                const dateAdded = Number.isFinite(date) && date > 0 ? date * 1000 : undefined;
                if (name === 'h3') {
                    pendingFolder = { type: 'folder', title: capture.text, children: [], dateAdded,
                        ...(capture.attributes.personal_toolbar_folder?.toLowerCase() === 'true' && stack.length <= 1 ? { rootKind: 'bar' } : {}) };
                    target.push(pendingFolder);
                } else target.push({ type: 'bookmark', title: capture.text, url: capture.attributes.href, dateAdded });
                capture = undefined;
            }
            if (name === 'dl' && stack.length) { target = stack.pop()!; openLists--; }
        },
    }, { decodeEntities: true });
    parser.write(content); parser.end();
    if (openLists || capture) throw new Error('The bookmark HTML file is incomplete');
    if (!count) throw new Error('The file contains no bookmark entries');
    return validateBookmarkItems(roots);
}

export function collectionToFile(folders: any[], bookmarks: any[]): BookmarkFileItem[] {
    const map = new Map<string, BookmarkFileItem>();
    for (const f of folders) map.set(f.masterId, { type: 'folder', title: f.title, children: [], position: f.position,
        dateAdded: f.dateAdded, ...(f.rootKind ? { rootKind: f.rootKind } : {}) });
    const roots: BookmarkFileItem[] = [];
    for (const f of folders) {
        const node = map.get(f.masterId)!;
        const parent = f.masterParentId ? map.get(f.masterParentId) : undefined;
        if (f.masterParentId && !parent) throw new Error('Collection has a missing parent; repair before exporting');
        (parent?.children || roots).push(node);
    }
    for (const b of bookmarks) {
        const parent = b.masterParentId ? map.get(b.masterParentId) : undefined;
        if (b.masterParentId && !parent) throw new Error('Collection has a missing parent; repair before exporting');
        (parent?.children || roots).push({ type: 'bookmark', title: b.title, url: b.url, position: b.position, dateAdded: b.dateAdded });
    }
    const visited = new Set<BookmarkFileItem>();
    const sort = (nodes: BookmarkFileItem[], depth = 0) => {
        if (depth > 128) throw new Error('Folder tree is too deep');
        nodes.sort((a, b) => (a.position || 0) - (b.position || 0));
        for (const n of nodes) { if (visited.has(n)) throw new Error('Collection has a folder cycle'); visited.add(n); if (n.children) sort(n.children, depth + 1); }
    };
    sort(roots);
    if (visited.size !== folders.length + bookmarks.length) throw new Error('Collection contains an unreachable folder cycle');
    return roots;
}
export function bookmarksToHtml(items: BookmarkFileItem[]): string {
    const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    const render = (nodes: BookmarkFileItem[]): string => nodes.map(node => node.type === 'folder'
        ? `<DT><H3${node.rootKind === 'bar' ? ' PERSONAL_TOOLBAR_FOLDER="true"' : ''}>${escape(node.title)}</H3>\n<DL><p>\n${render(node.children || [])}</DL><p>\n`
        : `<DT><A HREF="${escape(node.url || '')}"${node.dateAdded ? ` ADD_DATE="${Math.floor(node.dateAdded / 1000)}"` : ''}>${escape(node.title)}</A>\n`).join('');
    return `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n${render(items)}</DL><p>\n`;
}
