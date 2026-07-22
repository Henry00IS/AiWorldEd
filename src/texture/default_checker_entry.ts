import { TextureBrowserEntry } from './texture_browser_entry.js';
import {
  DEFAULT_CHECKER_DISPLAY_NAME,
  DEFAULT_CHECKER_TEXTURE_ID
} from './texture_id.js';

let checkerPreviewUrl: string | null = null;

/**
 * Returns a synthetic browser entry for the built-in checker.
 * Preview URL is stable for the session and must not be revoked by the library.
 * @returns Texture browser entry for the checker.
 */
export function getDefaultCheckerBrowserEntry(): TextureBrowserEntry {
  return {
    id: DEFAULT_CHECKER_TEXTURE_ID,
    displayName: DEFAULT_CHECKER_DISPLAY_NAME,
    fileName: 'checker.png',
    relativePath: DEFAULT_CHECKER_TEXTURE_ID,
    previewObjectUrl: getOrCreateCheckerPreviewUrl(),
    mimeType: 'image/png',
    byteSize: 0,
    sourceFile: createPlaceholderCheckerFile()
  };
}

/**
 * Returns whether an entry is the built-in checker (not a folder file).
 * @param entry Entry to test.
 * @returns True for the synthetic checker entry.
 */
export function isBuiltinCheckerEntry(entry: TextureBrowserEntry): boolean {
  return entry.id === DEFAULT_CHECKER_TEXTURE_ID;
}

/**
 * Builds or reuses a small checker data-URL for browser previews.
 * @returns Preview URL string.
 */
function getOrCreateCheckerPreviewUrl(): string {
  if (checkerPreviewUrl) return checkerPreviewUrl;
  checkerPreviewUrl = buildCheckerDataUrl();
  return checkerPreviewUrl;
}

/**
 * Paints a tiny checker into a data URL (no object URL to revoke).
 * @returns data:image/png URL, or empty transparent pixel on failure.
 */
function buildCheckerDataUrl(): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  }
  const cell = size / 4;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      context.fillStyle = (x + y) % 2 === 0 ? '#e8e8e8' : '#9a9a9a';
      context.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  return canvas.toDataURL('image/png');
}

/**
 * Creates a placeholder File for the synthetic checker entry.
 * @returns Empty PNG File.
 */
function createPlaceholderCheckerFile(): File {
  return new File([], 'checker.png', { type: 'image/png' });
}
