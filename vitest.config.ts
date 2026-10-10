import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'web/src') } },
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['server/src/**/*.test.ts', 'web/src/**/*.test.{ts,tsx}'],
    // 画面のテスト（*.test.tsx）は、ファイル先頭の `@vitest-environment jsdom` でブラウザ環境にする
    setupFiles: ['web/src/test/setup.ts'],
  },
});
