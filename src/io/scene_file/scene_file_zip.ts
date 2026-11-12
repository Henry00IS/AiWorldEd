import type { SceneJSON } from '@/io/scene/io_types.js';
import { ZipReader, zipReaderSignatureIs, type ZipReaderEntry } from '@/io/zip/zip_reader.js';
import { ZipWriter, type ZipWriterSink } from '@/io/zip/zip_writer.js';
import { SCENE_FILE_THUMBNAIL_ENTRY, sceneFileThumbnailAccept } from '@/io/scene_file/scene_file_thumbnail.js';
import {
  textureEmbeddedFallbackName,
  textureEmbeddedId,
  textureEmbeddedIdParse,
} from '@/texture/embedded/texture_embedded_id.js';
import type { TextureEmbedded } from '@/texture/embedded/texture_embedded_library.js';

/** Zip entry holding the level itself. */
export const SCENE_FILE_WORLD_ENTRY = 'world.json';

/** Zip folder holding the embedded textures. */
export const SCENE_FILE_TEXTURES_FOLDER = 'textures';

/** Name of an embedded texture image inside the zip. */
const SCENE_FILE_TEXTURE_ENTRY = /^textures\/([0-9a-f]{64})\.([a-z]+)$/;

/** What a level file holds. */
export interface SceneFileContents {
  /** Parsed level JSON (not yet validated). */
  data: unknown;
  /** Embedded textures; their bytes are read lazily from the file. */
  textures: TextureEmbedded[];
}

/**
 * Largest level file a zip without ZIP64 can hold (sizes and offsets are
 * 32-bit).
 */
export const SCENE_FILE_SIZE_LIMIT = 0xffffffff;

/** Most entries a zip without ZIP64 can hold. */
const SCENE_FILE_ENTRY_LIMIT = 0xffff;

/** Bytes counted per entry for its headers and name (more than a zip uses). */
const SCENE_FILE_ENTRY_OVERHEAD = 512;

/** Thrown when a level would not fit into a level file; nothing is written. */
export class SceneFileTooLargeError extends Error {
  /** What the user can do to make the level fit. */
  readonly advice =
    'A level file can hold up to 4 GB. To make the level smaller, remove embedded textures you no longer need ' +
    'or that are very large, save textures as files in the project folder instead of embedding them, or lower ' +
    'the resolution of large textures.';

  /** Creates the error. */
  constructor() {
    super('the level would be larger than 4 GB, the most a level file can hold');
    this.name = 'SceneFileTooLargeError';
  }
}

/**
 * Turns a level into the text of world.json.
 *
 * @param scene Level.
 * @returns JSON text.
 */
export function sceneFileWorldText(scene: SceneJSON): string {
  return JSON.stringify(scene, null, 2);
}

/**
 * Refuses a level whose file could exceed what a zip without ZIP64 holds. The
 * estimate never undercounts: world.json is counted as if it did not compress.
 *
 * @param world Text of world.json.
 * @param textures Embedded textures the level uses.
 * @param thumbnailSize Byte count of the optional thumbnail, or 0.
 * @throws {SceneFileTooLargeError} When the level does not fit.
 */
export function sceneFileSizeCheck(world: string, textures: readonly TextureEmbedded[], thumbnailSize = 0): void {
  const thumbnails = thumbnailSize > 0 ? 1 : 0;
  const entries = 1 + thumbnails + textures.length * 2;
  let size = sceneFileUtf8Bound(world) + thumbnailSize + entries * SCENE_FILE_ENTRY_OVERHEAD;
  for (const texture of textures) size += texture.blob.size + sceneFileUtf8Bound(texture.name);
  if (entries > SCENE_FILE_ENTRY_LIMIT || size > SCENE_FILE_SIZE_LIMIT) throw new SceneFileTooLargeError();
}

/**
 * Bounds the deflated size of a text: at most 3 UTF-8 bytes per character plus
 * deflate's few bytes per stored block.
 *
 * @param text Text.
 * @returns Byte count that is never too small.
 */
function sceneFileUtf8Bound(text: string): number {
  const bytes = text.length * 3;
  return bytes + Math.ceil(bytes / 16_384) * 5 + 64;
}

/**
 * Writes a level file: a zip with world.json (the level, deflated), an optional
 * thumbnail.webp (stored), and, per embedded texture, textures/<sha256>.<ext>
 * (the image, stored) and textures/<sha256>.json (its name). Everything streams
 * into the sink one piece at a time. A level that does not fit is refused
 * before anything is written.
 *
 * @param world Text of world.json (see {@link sceneFileWorldText}).
 * @param textures Embedded textures the level uses.
 * @param sink Receives the file bytes.
 * @param thumbnail Optional WebP thumbnail; omitted when missing or invalid.
 * @throws {SceneFileTooLargeError} When the level does not fit.
 */
export async function sceneFileWrite(
  world: string,
  textures: readonly TextureEmbedded[],
  sink: ZipWriterSink,
  thumbnail: Blob | null = null,
): Promise<void> {
  const picture = await sceneFileThumbnailAccept(thumbnail);
  sceneFileSizeCheck(world, textures, picture?.size ?? 0);
  const writer = new ZipWriter(sink);
  await writer.addText(SCENE_FILE_WORLD_ENTRY, world);
  if (picture !== null) await writer.addBlob(SCENE_FILE_THUMBNAIL_ENTRY, picture);
  for (const texture of textures) {
    const parts = textureEmbeddedIdParse(texture.id);
    if (parts === null) continue;
    await writer.addBlob(`${SCENE_FILE_TEXTURES_FOLDER}/${parts.hash}.${parts.extension}`, texture.blob);
    await writer.addText(`${SCENE_FILE_TEXTURES_FOLDER}/${parts.hash}.json`, JSON.stringify({ name: texture.name }));
  }
  await writer.close();
}

/**
 * Reads a level file: a zip (see {@link sceneFileWrite}), or a plain JSON level
 * from older versions, told apart by the first bytes. Only world.json and the
 * texture names are read; images stay in the file until shown.
 *
 * @param file Level file.
 * @returns Level JSON and embedded textures.
 */
export async function sceneFileRead(file: Blob): Promise<SceneFileContents> {
  if (!zipReaderSignatureIs(new Uint8Array(await file.slice(0, 4).arrayBuffer())))
    return { data: JSON.parse(await file.text()), textures: [] };
  const zip = await ZipReader.open(file);
  const world = zip.entry(SCENE_FILE_WORLD_ENTRY);
  if (world === null) throw new Error(`the file has no ${SCENE_FILE_WORLD_ENTRY}`);
  const [text, textures] = await Promise.all([(await zip.read(world)).text(), sceneFileTexturesRead(zip)]);
  return { data: JSON.parse(text), textures };
}

/**
 * Reads the embedded textures of a level zip.
 *
 * @param zip Level zip.
 * @returns Textures with lazy bytes.
 */
export async function sceneFileTexturesRead(zip: ZipReader): Promise<TextureEmbedded[]> {
  const read = zip.list().map(async (entry) => {
    const match = SCENE_FILE_TEXTURE_ENTRY.exec(entry.name);
    const id = match === null ? null : textureEmbeddedId(match[1]!, match[2]!);
    if (id === null || textureEmbeddedIdParse(id) === null) return null;
    const [name, blob] = await Promise.all([sceneFileTextureName(zip, match![1]!, id), zip.read(entry)]);
    return { id, name, blob };
  });
  return (await Promise.all(read)).filter((texture): texture is TextureEmbedded => texture !== null);
}

/**
 * Reads the name of an embedded texture.
 *
 * @param zip Level zip.
 * @param hash Texture hash.
 * @param id Texture id.
 * @returns Name.
 */
async function sceneFileTextureName(zip: ZipReader, hash: string, id: string): Promise<string> {
  const entry: ZipReaderEntry | null = zip.entry(`${SCENE_FILE_TEXTURES_FOLDER}/${hash}.json`);
  try {
    const name = entry === null ? null : (JSON.parse(await (await zip.read(entry)).text()) as { name?: unknown }).name;
    return typeof name === 'string' && name !== '' ? name : textureEmbeddedFallbackName(id);
  } catch {
    return textureEmbeddedFallbackName(id);
  }
}
