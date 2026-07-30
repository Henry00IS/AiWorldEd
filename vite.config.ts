import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so GitHub Pages project sites resolve index.js next to index.html.
  base: './',
  build: {
    outDir: 'docs',
    // Single-file app bundle so GitHub Pages never needs lazy chunk URLs.
    cssCodeSplit: false,
    rolldownOptions: {
      output: {
        codeSplitting: false,
        entryFileNames: 'index.js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
