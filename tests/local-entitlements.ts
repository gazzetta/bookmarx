import { createRequire } from 'node:module';
import path from 'node:path';

// Test-side fixture only. There is no privileged entitlement endpoint in the application.
export function grantLocalTestPremium(baseUrl: string, userId: string, email: string): void {
  const origin = new URL(baseUrl);
  if (!['localhost', '127.0.0.1'].includes(origin.hostname) || !/^free-l[23]-.*@bookmarx\.test$/.test(email)) {
    throw new Error('Local premium fixtures require localhost and a newly registered synthetic test account');
  }
  const require = createRequire(path.resolve('src/website/package.json'));
  const Database = require('better-sqlite3');
  const database = new Database(process.env.BOOKMARX_TEST_SERVER_DATABASE || path.resolve('src/website/data/bookmarx.db'));
  try {
    const user = database.prepare('SELECT email FROM users WHERE id = ?').get(userId);
    if (user?.email !== email) throw new Error('Fixture database does not contain this synthetic account');
    database.prepare("UPDATE users SET subscriptionTier = 'premium', subscriptionExpiresAt = NULL WHERE id = ? AND email = ?").run(userId, email);
  } finally { database.close(); }
}
