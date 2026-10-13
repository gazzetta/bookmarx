/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

// Root Vitest config for the BookMarx cross-component test harness.
// App code lives under src/<component>/; tests live under tests/<component>/.
// Each test file runs in its own process/fork so each gets a fresh module
// registry, which means a fresh DatabaseService singleton → ephemeral SQLite
// file (see tests/setup.ts). No shared state between files by default.
export default defineConfig({
  test: {
    // Only pick up root-tree tests/* files; the per-workspace Jest configs under
    // src/extension are intentionally left untouched for now.
    include: ['tests/**/*.test.ts', 'tests/audit/*.audit.ts'],
    pool: 'forks',
    isolate: true,
    environment: 'node',
    // Prevent Vitest from trying to load remote Vite deps for tests.
    deps: {
      interopDefault: true,
    },
    // Keep the noise down during CI; flip with --reporter=verbose locally.
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: 'test-results.junit.xml',
    coverage: {
      provider: 'v8',
      include: ['src/website/backend/**/*.ts'],
      exclude: ['**/*.test.ts', '**/node_modules/**'],
    },
  },
  // Make relative app imports resolve from the website workspace so test files
  // can simply write `import { app } from '../src/website/backend/server'`.
  resolve: {
    alias: {
      '@website': new URL('./src/website', import.meta.url).pathname,
      '@backend': new URL('./src/website/backend', import.meta.url).pathname,
    },
  },
  // `better-sqlite3` is a native module loaded from `src/website/node_modules`
  // (via the singleton's own directory walk). Vite would otherwise try to
  // transform it as a source file and emit an "esbuild can't transpile .node"
  // error, so the test pool must mark it as external/opt-out.
  optimizeDeps: {
    exclude: ['better-sqlite3'],
  },
  server: {
    deps: { external: ['better-sqlite3'] },
  } as Record<string, unknown>,
});
