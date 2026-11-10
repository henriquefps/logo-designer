import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
    // resvg rendering and CLI subprocess tests take 2-4 s alone and time out at the 5 s default
    // when the whole suite runs in parallel.
    testTimeout: 30_000,
  },
});
