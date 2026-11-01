/**
 * Build-time settings read through `import.meta.env` (set when running `vite
 * build`).
 */
interface ImportMetaEnv {
  readonly VITE_COLLABORATION_SERVER_URL?: string;
}
