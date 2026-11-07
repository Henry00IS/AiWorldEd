/**
 * Build-time settings read through `import.meta.env` (set when running `vite
 * build`).
 */
interface ImportMetaEnv {
  readonly VITE_COLLABORATION_SERVER_URL?: string;
}

/** Eager strategy discovery supplied by Vite and Vitest. */
interface ImportMeta {
  glob<T>(pattern: string, options: { eager: true; import: string }): Record<string, T>;
}
