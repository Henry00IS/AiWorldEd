import type { TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import { bytesDigest } from '@/utils/utils_bytes_digest.js';

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
/** Longest display name a texture index keeps per texture. */
export const TEXTURES_COLLABORATION_NAME_LENGTH_MAXIMUM = 120;

/** Texture library and its revision, compared to notice folder switches. */
export interface TexturesCollaborationStamp {
  library: TextureLibrary | null;
  revision: number;
}

/**
 * Revision notice: generation and the texture ids whose content changed. A
 * texture index also carries the owner's display names of listed textures.
 */
export interface TexturesCollaborationRevision {
  generation: number;
  ids: Set<string>;
  names: Map<string, string>;
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
    const tag = bytes === null || bytes.byteLength === 0 || bytes.byteLength > limit ? null : await bytesDigest(bytes);
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
 * Encodes a revision notice or texture index.
 *
 * @param generation Owner revision generation.
 * @param ids Texture ids whose content changed or vanished (or every offered
 *   one).
 * @param names Display names per id (texture index only).
 * @returns JSON bytes.
 */
export function texturesCollaborationRevisionEncode(
  generation: number,
  ids: readonly string[],
  names: ReadonlyMap<string, string> = new Map(),
): Uint8Array {
  const notice =
    names.size > 0 ? { v: 1, g: generation, ids, n: Object.fromEntries(names) } : { v: 1, g: generation, ids };
  return new TextEncoder().encode(JSON.stringify(notice));
}

/**
 * Cleans a display name received from the room owner: it is shown as plain
 * text, so control and bidirectional formatting characters are dropped,
 * whitespace is collapsed and the length is capped.
 *
 * @param value Received value.
 * @returns Name, or null when nothing usable is left.
 */
export function texturesCollaborationNameClean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value
    .slice(0, TEXTURES_COLLABORATION_NAME_LENGTH_MAXIMUM * 4)
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return name === '' ? null : [...name].slice(0, TEXTURES_COLLABORATION_NAME_LENGTH_MAXIMUM).join('');
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
  const notice = value as { v?: unknown; g?: unknown; ids?: unknown; n?: unknown } | null;
  if (notice?.v !== 1 || !Number.isSafeInteger(notice.g) || (notice.g as number) <= after) return null;
  if (!Array.isArray(notice.ids) || notice.ids.length > TEXTURES_COLLABORATION_REVISION_IDS_MAXIMUM) return null;
  const ids = new Set<string>();
  for (const id of notice.ids as unknown[]) {
    if (typeof id !== 'string' || id === '' || id.length > TEXTURES_COLLABORATION_REVISION_ID_MAXIMUM) return null;
    ids.add(id);
  }
  return { generation: notice.g as number, ids, names: texturesCollaborationNamesParse(notice.n, ids) };
}

/**
 * Reads the display names of a texture index; names of ids the index does not
 * list, and unusable names, are dropped.
 *
 * @param value Received names object.
 * @param ids Listed ids.
 * @returns Clean name per id.
 */
function texturesCollaborationNamesParse(value: unknown, ids: ReadonlySet<string>): Map<string, string> {
  const names = new Map<string, string>();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return names;
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    const name = ids.has(id) ? texturesCollaborationNameClean(raw) : null;
    if (name !== null) names.set(id, name);
  }
  return names;
}
