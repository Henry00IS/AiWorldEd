import type { FbxExportTextureFile } from './fbx_export_types.js';
import type { FbxMapRecord } from './fbx_surface_records.js';
import { encodeTextureMapToPngBlob } from './obj_texture_encoder.js';

/**
 * Encodes FBX map records into PNG blobs for sidecar export.
 *
 * @param maps Map records from the surface registry.
 * @returns Texture files with unique file names.
 */
export async function encodeFbxTextureFiles(maps: readonly FbxMapRecord[]): Promise<FbxExportTextureFile[]> {
  const files: FbxExportTextureFile[] = [];
  const encoded = new Set<string>();
  for (const map of maps) {
    if (encoded.has(map.texture.uuid)) continue;
    encoded.add(map.texture.uuid);
    const blob = await encodeTextureMapToPngBlob(map.texture);
    if (!blob) continue;
    files.push({ fileName: map.fileName, blob });
  }
  return files;
}
