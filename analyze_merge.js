const fs = require('fs');
const { parse } = require('node-html-parser');

// Parse Helium HTML
const html = fs.readFileSync('helium.html', 'utf8');
const root = parse(html);

const folders = [];
const bookmarks = [];
let folderIdCounter = 1;

function processNode(node, parentPath = '', parentId = null) {
    const dt = node.querySelector('dt');
    if (!dt) return;
    
    const h3 = dt.querySelector('h3');
    const a = dt.querySelector('a');
    const dl = node.querySelector(':scope > dl');
    
    if (h3) {
        // This is a folder
        const title = h3.text.trim();
        const currentId = `folder_${folderIdCounter++}`;
        const currentPath = parentPath ? `${parentPath}/${title}` : title;
        
        folders.push({
            id: currentId,
            title: title,
            parentId: parentId,
            path: currentPath
        });
        
        // Process children
        if (dl) {
            const children = dl.childNodes.filter(n => n.nodeType === 1);
            children.forEach(child => {
                if (child.tagName === 'DT') {
                    const childDl = child.nextElementSibling;
                    if (childDl && childDl.tagName === 'DL') {
                        processNode(child.parentNode, currentPath, currentId);
                    }
                }
            });
        }
    } else if (a) {
        // This is a bookmark
        const url = a.getAttribute('href');
        const title = a.text.trim();
        const path = parentPath || 'Bookmarks bar';
        
        bookmarks.push({
            url: url,
            title: title,
            folderPath: path
        });
    }
}

// Start processing from root
const rootDl = root.querySelector('dl');
if (rootDl) {
    const children = rootDl.childNodes.filter(n => n.nodeType === 1);
    children.forEach(child => {
        if (child.tagName === 'DT') {
            processNode(child);
        }
    });
}

console.log('=== HELIUM BOOKMARKS ANALYSIS ===');
console.log(`Total Folders: ${folders.length}`);
console.log(`Total Bookmarks: ${bookmarks.length}`);
console.log('\n=== FOLDER STRUCTURE ===');
folders.forEach(f => console.log(`  ${f.path}`));
console.log('\n=== FIRST 10 BOOKMARKS ===');
bookmarks.slice(0, 10).forEach(b => console.log(`  ${b.folderPath} | ${b.url}`));

// Save for comparison
fs.writeFileSync('helium_parsed.json', JSON.stringify({ folders, bookmarks }, null, 2));
console.log('\nSaved to helium_parsed.json');
