import { glbImportFileNameSanitize } from '@/io/glb/import/glb_import_images.js';
import type { GlbImportImage } from '@/io/glb/import/glb_import_types.js';
import { textureImageSniff } from '@/texture/library/texture_image_sniff.js';
import type { FbxImportDocument } from '@/io/fbx/import/parse/fbx_import_document.js';
import { fbxImportObjectName, type FbxImportNode } from '@/io/fbx/import/parse/fbx_import_node.js';
import type { FbxImportTexture } from '@/io/fbx/import/fbx_import_types.js';

/** Material property names that hold the diffuse map, best first. */
const FBX_IMPORT_DIFFUSE_PROPERTY_RANKS: readonly RegExp[] = [/diffusecolor/i, /base_?color/i, /diffuse/i];

/**
 * Finds the diffuse texture of every material and reads where its image lives:
 * embedded bytes (Video "Content") and the file paths the FBX names.
 */
export class FbxImportTextureReader {
  private readonly textureIndexById = new Map<string, number>();
  private readonly textures: FbxImportTexture[] = [];

  /**
   * Creates a reader.
   *
   * @param document Parsed file.
   */
  constructor(private readonly document: FbxImportDocument) {}

  /**
   * Returns the texture index of a material's diffuse map.
   *
   * @param materialId Material object id.
   * @returns Texture index, or null when the material has no diffuse map.
   */
  materialTextureIndex(materialId: string): number | null {
    const textureId = this.materialDiffuseTextureId(materialId);
    if (textureId === null) return null;
    const known = this.textureIndexById.get(textureId);
    if (known !== undefined) return known;
    const index = this.textures.length;
    this.textureIndexById.set(textureId, index);
    this.textures.push(this.textureRead(textureId, index));
    return index;
  }

  /**
   * Returns every texture found so far.
   *
   * @returns Textures in index order.
   */
  texturesFound(): readonly FbxImportTexture[] {
    return this.textures;
  }

  /**
   * Finds the texture connected to a material's diffuse property.
   *
   * @param materialId Material object id.
   * @returns Texture object id, or null.
   */
  private materialDiffuseTextureId(materialId: string): string | null {
    let best: { id: string; rank: number } | null = null;
    for (const link of this.document.childrenOf(materialId)) {
      const rank = FBX_IMPORT_DIFFUSE_PROPERTY_RANKS.findIndex((pattern) => pattern.test(link.property));
      const textureId = rank < 0 ? null : this.textureFollow(link.id);
      if (textureId !== null && (best === null || rank < best.rank)) best = { id: textureId, rank };
    }
    return best?.id ?? null;
  }

  /**
   * Resolves a texture or layered texture to a plain texture.
   *
   * @param id Connected object id.
   * @returns Texture object id, or null.
   */
  private textureFollow(id: string): string | null {
    const node = this.document.object(id);
    if (node?.name === 'Texture') return id;
    if (node?.name !== 'LayeredTexture') return null;
    const layer = this.document.childrenOf(id).find((link) => this.document.object(link.id)?.name === 'Texture');
    return layer?.id ?? null;
  }

  /**
   * Reads one texture's name, file paths and embedded image.
   *
   * @param textureId Texture object id.
   * @param index Texture index.
   * @returns Texture.
   */
  private textureRead(textureId: string, index: number): FbxImportTexture {
    const texture = this.document.object(textureId);
    const video = this.textureVideo(textureId);
    const references = fbxImportTextureReferences(texture, video);
    const name = fbxImportTextureName(texture, references, index);
    const bytes = video === null ? null : fbxImportVideoContent(video);
    const sniffed = bytes === null ? null : textureImageSniff(bytes);
    const image: GlbImportImage | null =
      bytes === null || sniffed === null ? null : { index, name, mimeType: sniffed.mime, bytes };
    return { index, name, references, image };
  }

  /**
   * Finds the video (image clip) record of a texture.
   *
   * @param textureId Texture object id.
   * @returns Video record, or null.
   */
  private textureVideo(textureId: string): FbxImportNode | null {
    const link = this.document.childrenOf(textureId).find((entry) => this.document.object(entry.id)?.name === 'Video');
    return link === undefined ? null : this.document.object(link.id);
  }
}

/**
 * Lists the image paths a texture and its video name, relative paths first.
 *
 * @param texture Texture record, or null.
 * @param video Video record, or null.
 * @returns Distinct non-empty paths.
 */
function fbxImportTextureReferences(texture: FbxImportNode | null, video: FbxImportNode | null): string[] {
  const candidates = [
    texture?.childString('RelativeFilename'),
    video?.childString('RelativeFilename'),
    texture?.childString('FileName'),
    video?.childString('Filename'),
  ];
  const paths = candidates.map((path) => (path ?? '').trim()).filter((path) => path.length > 0);
  return [...new Set(paths)];
}

/**
 * Picks a file-safe name: the image file's stem, else the texture's name.
 *
 * @param texture Texture record, or null.
 * @param references Image paths.
 * @param index Texture index.
 * @returns Name without extension.
 */
function fbxImportTextureName(texture: FbxImportNode | null, references: readonly string[], index: number): string {
  const candidates = [...references, fbxImportObjectName(texture?.properties[1])].map(glbImportFileNameSanitize);
  return candidates.find((candidate) => candidate.length > 0) ?? `texture_${index}`;
}

/**
 * Reads the embedded image bytes of a video record (binary bytes or ASCII
 * base64 text).
 *
 * @param video Video record.
 * @returns Bytes, or null when the image is not embedded.
 */
function fbxImportVideoContent(video: FbxImportNode): Uint8Array | null {
  const values = video.child('Content')?.properties ?? [];
  const raw = values.find((value): value is Uint8Array => value instanceof Uint8Array);
  if (raw !== undefined) return raw.byteLength > 0 ? raw : null;
  const base64 = values.filter((value): value is string => typeof value === 'string').join('');
  return base64.length > 0 ? fbxImportBase64Decode(base64) : null;
}

/**
 * Decodes base64 text.
 *
 * @param text Base64 text.
 * @returns Bytes, or null when the text is not valid base64.
 */
function fbxImportBase64Decode(text: string): Uint8Array | null {
  try {
    const binary = atob(text.replace(/\s+/g, ''));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}
