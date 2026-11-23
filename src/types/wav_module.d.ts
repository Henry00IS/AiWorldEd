/**
 * Vite asset URL imports for WAV files (snap clicks and keyboard samples;
 * inlined as data URLs in the production index.js when under
 * assetsInlineLimit).
 */
declare module '*.wav' {
  const assetUrl: string;
  export default assetUrl;
}
