import { createRequire } from 'node:module';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

export function issueLocalTestVerificationToken(baseUrl: string, userId: string, email: string): string {
  if (!['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname) || !/^free-l[23]-.+@bookmarx\.test$/.test(email)) {
    throw new Error('Verification token fixtures require a new synthetic localhost account');
  }
  const require = createRequire(path.resolve('src/website/package.json'));
  const Database = require('better-sqlite3');
  const database = new Database(process.env.BOOKMARX_TEST_SERVER_DATABASE || path.resolve('src/website/data/bookmarx.db'));
  const token = randomBytes(32).toString('hex');
  try {
    const user = database.prepare('SELECT email, emailVerifiedAt FROM users WHERE id = ?').get(userId);
    if (user?.email !== email || user.emailVerifiedAt) throw new Error('Fixture must be an unverified synthetic account');
    const now = Math.floor(Date.now() / 1000);
    database.transaction(() => {
      database.prepare('DELETE FROM email_verification_tokens WHERE userId = ?').run(userId);
      database.prepare('INSERT INTO email_verification_tokens VALUES (?, ?, ?, ?, ?)')
        .run(createHash('sha256').update(token).digest('hex'), userId, email, now + 86400, now);
    })();
    return token;
  } finally { database.close(); }
}

export function verifyLocalTestEmail(baseUrl: string, userId: string, email: string): void {
  if (!['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname) || !/^(free-l[23]-|firefox-probe-).+@bookmarx\.test$/.test(email)) {
    throw new Error('Verified fixtures require a newly registered synthetic account on localhost');
  }
  const require = createRequire(path.resolve('src/website/package.json'));
  const Database = require('better-sqlite3');
  const database = new Database(process.env.BOOKMARX_TEST_SERVER_DATABASE || path.resolve('src/website/data/bookmarx.db'));
  try {
    const user = database.prepare('SELECT email FROM users WHERE id = ?').get(userId);
    if (user?.email !== email) throw new Error('Fixture database does not contain this synthetic account');
    database.prepare("UPDATE users SET emailVerifiedAt = strftime('%s','now') WHERE id = ? AND email = ?").run(userId, email);
    database.prepare('DELETE FROM email_verification_tokens WHERE userId = ?').run(userId);
  } finally { database.close(); }
}

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
