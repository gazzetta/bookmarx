import fs from 'fs';
import path from 'path';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT || 3005);

const websiteDir = process.cwd();
const defaultDbPath = path.join(websiteDir, 'data', 'bookmarx.db');

if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = defaultDbPath;
}

const dataDir = path.dirname(process.env.DATABASE_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

async function start() {
  const nextApp = next({ dev, dir: websiteDir });
  const handle = nextApp.getRequestHandler();

  const { app: apiApp } = await import('./backend/server');

  await nextApp.prepare();

  apiApp.all('*', (req, res) => handle(req, res));

  apiApp.listen(port, () => {
    console.log(`Unified BookMarx app running on http://localhost:${port}`);
    console.log(`Database path: ${process.env.DATABASE_PATH}`);
  });
}

start().catch((error) => {
  console.error('Failed to start unified app:', error);
  process.exit(1);
});
