import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  // Match production inlining so WAV imports resolve under vitest.
  assetsInclude: ['**/*.wav', '**/*.glb'],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
