import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import type { BunPlugin } from 'bun';

/** Bun namespace for Vite-style `?url` asset modules. */
const ASSET_URL_NAMESPACE = 'electrobun-asset-url';

/**
 * Resolves the repository root for Bun (import.meta.dir) and Node/vitest
 * (import.meta.url).
 *
 * @returns Absolute workspace root path.
 */
function resolveWorkspaceRoot(): string {
  const metaWithDir = import.meta as ImportMeta & { dir?: string };
  const scriptDirectory =
    typeof metaWithDir.dir === 'string' && metaWithDir.dir.length > 0
      ? metaWithDir.dir
      : dirname(fileURLToPath(import.meta.url));
  return resolve(scriptDirectory, '..');
}

const workspaceRoot = resolveWorkspaceRoot();
const srcRoot = join(workspaceRoot, 'src');

/**
 * Strips a trailing import query string from a module specifier.
 *
 * @param importPath Specifier that may include `?url` or other queries.
 * @returns Path without query and whether the query was Vite `url`.
 */
export function stripImportSpecifierQuery(importPath: string): {
  path: string;
  isUrlQuery: boolean;
} {
  const queryIndex = importPath.indexOf('?');
  if (queryIndex < 0) {
    return { path: importPath, isUrlQuery: false };
  }
  const query = importPath.slice(queryIndex + 1);
  return {
    path: importPath.slice(0, queryIndex),
    isUrlQuery: query === 'url' || query.startsWith('url&'),
  };
}

/**
 * Removes a trailing .js or .ts extension from a relative import path.
 *
 * @param relativePath Path under src/.
 * @returns Path without a trailing module extension.
 */
function stripTrailingModuleExtension(relativePath: string): string {
  if (relativePath.endsWith('.js') || relativePath.endsWith('.ts')) {
    return relativePath.slice(0, -3);
  }
  return relativePath;
}

/**
 * Resolves an import path that uses the @/ src alias to a filesystem path.
 *
 * @param importPath Specifier starting with @/ (query already stripped).
 * @returns Absolute path when a matching file exists, otherwise null.
 */
export function resolveAtImport(importPath: string): string | null {
  if (!importPath.startsWith('@/')) {
    return null;
  }
  const relativePath = importPath.slice(2);
  const withoutJs = stripTrailingModuleExtension(relativePath);
  const candidates = [
    join(srcRoot, withoutJs + '.ts'),
    join(srcRoot, withoutJs + '.tsx'),
    join(srcRoot, withoutJs, 'index.ts'),
    join(srcRoot, relativePath),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Returns the lower-case file extension including the leading dot.
 *
 * Uses slash-normalized basename matching so Windows-style paths work on Linux
 * CI even when the platform path module treats backslashes as ordinary chars.
 *
 * @param absolutePath Absolute or relative filesystem path.
 * @returns Extension such as `.glb`, or empty string when none.
 */
export function extensionForAssetPath(absolutePath: string): string {
  const normalizedPath = absolutePath.replace(/\\/g, '/');
  const baseNameStart = normalizedPath.lastIndexOf('/') + 1;
  const baseName = normalizedPath.slice(baseNameStart);
  const dotIndex = baseName.lastIndexOf('.');
  if (dotIndex <= 0) {
    return '';
  }
  return baseName.slice(dotIndex).toLowerCase();
}

/**
 * Returns a MIME type for an asset file path.
 *
 * @param absolutePath Absolute filesystem path.
 * @returns MIME type string for data URLs.
 */
export function mimeTypeForAssetPath(absolutePath: string): string {
  const extension = extensionForAssetPath(absolutePath);
  if (extension === '.wav') {
    return 'audio/wav';
  }
  if (extension === '.glb') {
    return 'model/gltf-binary';
  }
  if (extension === '.png') {
    return 'image/png';
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }
  return 'application/octet-stream';
}

/**
 * Builds a JS module that default-exports a data URL for a binary asset.
 *
 * @param absolutePath Absolute path to the asset file.
 * @returns Module source text.
 */
export function buildAssetDataUrlModuleContents(absolutePath: string): string {
  const bytes = readFileSync(absolutePath);
  const mime = mimeTypeForAssetPath(absolutePath);
  const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;
  return `export default ${JSON.stringify(dataUrl)};\n`;
}

/**
 * Resolves a `@/` or relative specifier to an absolute asset path for `?url`.
 *
 * @param importPath Specifier including optional `?url`.
 * @param resolveDir Importer directory for relative paths.
 * @returns Absolute path when found, otherwise null.
 */
function resolveAssetUrlImportPath(importPath: string, resolveDir: string): string | null {
  const { path: pathOnly, isUrlQuery } = stripImportSpecifierQuery(importPath);
  if (!isUrlQuery) {
    return null;
  }
  if (pathOnly.startsWith('@/')) {
    return resolveAtImport(pathOnly);
  }
  const absolutePath = resolve(resolveDir, pathOnly);
  return existsSync(absolutePath) ? absolutePath : null;
}

/**
 * Resolves an `@/` specifier when it is not a Vite `?url` asset import.
 *
 * @param importPath Full import specifier.
 * @returns Resolve result or null.
 */
function resolveAtImportWithoutUrlQuery(importPath: string): { path: string } | null {
  const { path: pathOnly, isUrlQuery } = stripImportSpecifierQuery(importPath);
  if (isUrlQuery) {
    return null;
  }
  const resolved = resolveAtImport(pathOnly);
  if (!resolved) {
    return null;
  }
  return { path: resolved };
}

/**
 * Bun plugin so Electrobun's Bun.build() resolves tsconfig paths aliases (Bun
 * CLI already does; the programmatic API often does not). Skips `?url` assets
 * so the asset-url plugin can inline them.
 *
 * @returns Configured Bun plugin.
 */
export function createTsconfigPathsPlugin(): BunPlugin {
  return {
    name: 'electrobun-tsconfig-paths',
    setup(build) {
      build.onResolve({ filter: /^@\// }, (args) => {
        return resolveAtImportWithoutUrlQuery(args.path);
      });
    },
  };
}

/**
 * Bun plugin that inlines Vite-style `import x from '...?url'` assets as data
 * URLs (matches vite assetsInlineLimit for short snap WAV files).
 *
 * @returns Configured Bun plugin.
 */
export function createAssetUrlPlugin(): BunPlugin {
  return {
    name: 'electrobun-asset-url',
    setup(build) {
      build.onResolve({ filter: /\?url(?:$|&)/ }, (args) => {
        const resolved = resolveAssetUrlImportPath(args.path, args.resolveDir);
        if (!resolved) {
          return null;
        }
        return { path: resolved, namespace: ASSET_URL_NAMESPACE };
      });
      build.onLoad({ filter: /.*/, namespace: ASSET_URL_NAMESPACE }, (args) => {
        return {
          contents: buildAssetDataUrlModuleContents(args.path),
          loader: 'js',
        };
      });
    },
  };
}

/**
 * Shared Bun.build plugin list for Electrobun bun and view entrypoints.
 *
 * @returns Plugin array for electrobun.config.ts.
 */
export function createElectrobunBuildPlugins(): BunPlugin[] {
  return [createAssetUrlPlugin(), createTsconfigPathsPlugin()];
}
