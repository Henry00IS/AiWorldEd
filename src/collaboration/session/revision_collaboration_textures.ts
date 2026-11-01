import type { TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';

/**
 * Asset name of a texture revision notice. Texture ids are image file paths, so
 * a name without an image extension never collides with one.
 */
export const TEXTURES_COLLABORATION_REVISION_NAME = 'aiworlded:texture-revision';
/** Shortest time between two revision notices, on both ends. */
export const TEXTURES_COLLABORATION_REVISION_INTERVAL_MS = 2000;
/** Most texture ids one revision notice may list. */
export const TEXTURES_COLLABORATION_REVISION_IDS_MAXIMUM = 4096;
/** Longest texture id a revision notice may list. */
const TEXTURES_COLLABORATION_REVISION_ID_MAXIMUM = 512;

/** Texture library and its revision, compared to notice folder switches. */
export interface TexturesCollaborationStamp {
  library: TextureLibrary | null;
  revision: number;
}

/** Revision notice: generation and the texture ids whose content changed. */
export interface TexturesCollaborationRevision {
  generation: number;
  ids: Set<string>;
}

/**
 * Returns the stamp of a library.
 *
 * @param library Library, or null.
 * @returns Stamp.
 */
export function texturesCollaborationStamp(library: TextureLibrary | null): TexturesCollaborationStamp {
  return { library, revision: library?.getRevision() ?? 0 };
}

/**
 * Tells whether two stamps name the same library content.
 *
 * @param a First stamp.
 * @param b Second stamp.
 * @returns True when equal.
 */
export function texturesCollaborationStampSame(a: TexturesCollaborationStamp, b: TexturesCollaborationStamp): boolean {
  return a.library === b.library && a.revision === b.revision;
}

/**
 * Hashes file bytes to a short content tag (SHA-256 prefix, or FNV-1a where Web
 * Crypto is unavailable).
 *
 * @param bytes File bytes.
 * @returns Hex tag.
 */
export async function texturesCollaborationDigest(bytes: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) return texturesCollaborationFnv(new Uint8Array(bytes));
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return [...digest.subarray(0, 12)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

/**
 * Hashes bytes with 32-bit FNV-1a, prefixed with the length.
 *
 * @param bytes Bytes.
 * @returns Hex tag.
 */
function texturesCollaborationFnv(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const value of bytes) hash = Math.imul(hash ^ value, 0x01000193) >>> 0;
  return `${bytes.byteLength.toString(16)}-${hash.toString(16)}`;
}

/**
 * Hashes a library entry once; the tag is cached per entry object, and null
 * means the file cannot be sent (unreadable, empty or above the limit).
 */
export class TexturesCollaborationHashes {
  private readonly cache: WeakMap<TextureBrowserEntry, string | null>;

  /** Creates an empty hash cache. */
  constructor() {
    this.cache = new WeakMap();
  }

  /**
   * Returns the content tag of an entry.
   *
   * @param entry Library entry, or null.
   * @param limit Largest file the relay accepts.
   * @returns Tag, or null when the texture cannot be sent.
   */
  async of(entry: TextureBrowserEntry | null, limit: number): Promise<string | null> {
    if (entry === null) return null;
    const known = this.cache.get(entry);
    if (known !== undefined) return known;
    const bytes = await entry.sourceFile.arrayBuffer().catch(() => null);
    const tag =
      bytes === null || bytes.byteLength === 0 || bytes.byteLength > limit
        ? null
        : await texturesCollaborationDigest(bytes);
    this.cache.set(entry, tag);
    return tag;
  }

  /**
   * Records the tag of bytes already read for an entry.
   *
   * @param entry Library entry.
   * @param tag Content tag.
   */
  remember(entry: TextureBrowserEntry, tag: string): void {
    this.cache.set(entry, tag);
  }
}

/**
 * Encodes a revision notice.
 *
 * @param generation Owner revision generation.
 * @param ids Texture ids whose content changed or vanished.
 * @returns JSON bytes.
 */
export function texturesCollaborationRevisionEncode(generation: number, ids: readonly string[]): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ v: 1, g: generation, ids }));
}

/**
 * Parses a revision notice; anything malformed, stale or oversized is null.
 *
 * @param bytes Received bytes.
 * @param after Last generation applied.
 * @returns Notice, or null.
 */
export function texturesCollaborationRevisionParse(
  bytes: Uint8Array,
  after: number,
): TexturesCollaborationRevision | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  const notice = value as { v?: unknown; g?: unknown; ids?: unknown } | null;
  if (notice?.v !== 1 || !Number.isSafeInteger(notice.g) || (notice.g as number) <= after) return null;
  if (!Array.isArray(notice.ids) || notice.ids.length > TEXTURES_COLLABORATION_REVISION_IDS_MAXIMUM) return null;
  const ids = new Set<string>();
  for (const id of notice.ids as unknown[]) {
    if (typeof id !== 'string' || id === '' || id.length > TEXTURES_COLLABORATION_REVISION_ID_MAXIMUM) return null;
    ids.add(id);
  }
  return { generation: notice.g as number, ids };
}
