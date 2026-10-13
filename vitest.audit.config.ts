import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// Explicit launch gates, kept separate from the established green suite.
// These assert the desired behaviour and must fail until the defects are fixed.
export default defineConfig({
  ...base,
  test: { ...base.test, include: ['tests/audit/*.audit.ts'], reporters: ['default'] },
});
