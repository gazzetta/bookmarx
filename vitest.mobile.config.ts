import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { include: ['tests/mobile/*.mobile.ts'], environment: 'node', pool: 'forks', maxWorkers: 1 },
  resolve: {
    alias: Object.fromEntries(['react-native', '@react-native-async-storage/async-storage', 'expo-secure-store', 'expo-crypto'].map((name, index) => [
      name, fileURLToPath(new URL(`./tests/mobile/native-${index}.ts`, import.meta.url)),
    ])),
  },
});
