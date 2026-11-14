/**
 * Vite asset URL imports for short snap WAV files (inlined as data URLs in the
 * production index.js when under assetsInlineLimit).
 */
declare module '*.wav' {
  const assetUrl: string;
  export default assetUrl;
}
