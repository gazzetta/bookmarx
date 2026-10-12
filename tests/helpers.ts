// tests/helpers.ts
//
// Shared HTTP/DB primitives for the API suite. Imports `tests/setup.ts` first
// to pin environment before the Express app (and thus the SQLite singleton)
// is constructed.
import './setup';
import requestDefault from 'supertest';

// supertest v7 ships `module.exports = function` with NO named `request`
// export; the default import is the callable. `request` below is what tests
// call as `request(app).post(...)`. We bind it explicitly so editor intellisense
// keeps the callable signature.
const request = requestDefault;

// `app` is exported from backend/server.ts. Importing it here triggers the
// singleton DB construction (against DATABASE_PATH from setup.ts) the first
// time any test imports this helper within a worker.
import { app as apiApp } from '../src/website/backend/server';

// Resolves once the file-migration runner has finished applying the
// migrations under src/website/backend/db/migrations/. We have to wait for
// it before any test request lands, otherwise handlers race against column
// add-ons like `browsers.currentCollectionId` (see DatabaseService.readyPromise
// doc for the full rationale). Tests import this and `await` it in `beforeAll`.
import { dbReady as dbReadyPromise } from '../src/website/backend/db/database';
export const dbReady = dbReadyPromise;

export const baseUrl = '/api/v1';

// Re-export the wired app for tests that want to add direct DB assertions
// (e.g. to verify the polar webhook actually flipped subscriptionTier).
import { db } from '../src/website/backend/db/database';
export { db };

let counter = 0;
export function uniqueEmail(prefix = 'user'): string {
  counter += 1;
  // Domain is irrelevant for the password flow; using .test keeps it obviously
  // synthetic and excludes it from the ALWAYS_PREMIUM allowlist in auth.ts:39.
  return `${prefix}+${process.pid}-${Date.now()}-${counter}@bookmarx.test`;
}

export function uniqueDeviceId(prefix = 'dev'): string {
  counter += 1;
  return `${prefix}-${process.pid}-${Date.now()}-${counter}`;
}

export interface RegisteredUser {
  email: string;
  password: string;
  token: string;
  userId: string;
}

// Register a fresh user and return credentials + bearer token. Tests that need
// >1 user (e.g. cross-user isolation) call this multiple times.
//
// `overrides` is the FIRST parameter so callers can write `registerUser({ email }),
// rather than `registerUser(undefined, { email })`. The `app` arg lives second
// (rarely overridden — only tests that swap to a non-default server need it).
export async function registerUser(
  overrides: { email?: string; password?: string } = {},
  app = apiApp,
): Promise<RegisteredUser> {
  const email = overrides.email ?? uniqueEmail();
  const password = overrides.password ?? 'Sup3rSecret!123';
  const res = await request(app).post(`${baseUrl}/auth/register`).send({ email, password });
  if (res.status !== 200) {
    throw new Error(`registerUser failed: ${res.status} ${res.text}`);
  }
  const token = res.body.data.token as string;
  const userId = res.body.data.user.id as string;
  return { email, password, token, userId };
}

// Return an Authorization header value suitable for `set('Authorization', ...)`.
export function bearer(token: string): string {
  return `Bearer ${token}`;
}

// A canonical DeviceInfo block for `/sync*` endpoints. Per-call overrides let
// tests simulate "two browsers / same user" scenarios.
export function deviceInfo(overrides: Partial<DeviceMeta> = {}): DeviceMeta {
  return {
    browserInstanceId: uniqueDeviceId('binst'),
    deviceId: uniqueDeviceId('dev'),
    browser: 'Chrome',
    browserVersion: '124.0.0.0',
    os: 'Windows',
    osVersion: '11',
    ...overrides,
  };
}

export interface DeviceMeta {
  browserInstanceId: string;
  deviceId: string;
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
}

export function syncMetadata(device: DeviceMeta) {
  return {
    deviceInfo: device,
    userAgent: 'vitest/1.0',
    timestamp: Math.floor(Date.now() / 1000),
  };
}

// Convenience for tests that want a single throwaway bookmark shape.
//
// The `BookmarkData` type in src/website/backend/types/sync.ts uses the field
// name `index`, but `DatabaseService.createBookmark` (database.ts:502) reads
// `bookmark.position` (schema.sql:121 declares `position INTEGER NOT NULL`).
// The browser extension must therefore be sending `position` directly. We send
// BOTH so the round-trip works regardless of which name the code inspects.
export function makeBookmark(o: Partial<{
  id: string; url: string; title: string; parentId: string;
  index: number; position: number; dateAdded: number;
}> = {}) {
  const position = o.position ?? o.index ?? 0;
  const id = o.id ?? `bm-${Math.random().toString(36).slice(2, 10)}`;
  return {
    // `id` matches the BookmarkData TS interface, but `db.createBookmark`
    // (database.ts:502) actually reads `bookmark.browserId`, and the /sync
    // DELETE branch (`db.deleteBookmark({ id: data.browserId, ... })`,
    // server.ts:241) matches on `WHERE browserId = ?`. So the wire contract
    // uses `browserId`; we send BOTH so the legacy `id` shape and the actual
    // lookups both resolve to the same row.
    id,
    browserId: id,
    url: o.url ?? 'https://example.com/' + Math.random().toString(36).slice(2, 6),
    title: o.title ?? 'Example',
    // '1' is Chrome's "Bookmarks Bar" root; server's resolveMasterParentId
    // (server.ts:96) treats '1' as a root and yields masterParentId=null.
    parentId: o.parentId ?? '1',
    index: o.index ?? position,
    position,
    dateAdded: o.dateAdded ?? Math.floor(Date.now() / 1000),
  };
}

export function makeFolder(o: Partial<{
  id: string; title: string; parentId: string | null;
  index: number; position: number; dateAdded: number;
}> = {}) {
  const position = o.position ?? o.index ?? 0;
  const id = o.id ?? `fld-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id,
    browserId: id,
    title: o.title ?? 'Test Folder',
    parentId: o.parentId ?? null,
    index: o.index ?? position,
    position,
    dateAdded: o.dateAdded ?? Math.floor(Date.now() / 1000),
  };
}

// Reference to the bound Express app. Tests only need the value; the type is
// inferred from `apiApp` itself (declared in src/website/server.ts as
// `Express`), so we don't have to add `@types/express` to the root tree.
export const app = apiApp;