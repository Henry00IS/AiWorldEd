import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
  resolve: {
    tsconfigPaths: true,
  },
  // Relative base so GitHub Pages project sites resolve index.js next to index.html.
  base: './',
  // Character models are imported as asset URLs, like the built-in WAV type.
  assetsInclude: ['**/*.glb'],
  build: {
    outDir: 'docs',
    // Single-file app bundle so GitHub Pages never needs lazy chunk URLs.
    cssCodeSplit: false,
    // Keep short snap WAVs inside index.js (data URLs), not separate assets.
    assetsInlineLimit: 100_000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'index.js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
