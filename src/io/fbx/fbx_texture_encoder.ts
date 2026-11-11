import type { FbxExportTextureFile } from './fbx_export_types.js';
import type { FbxMapRecord } from './fbx_surface_records.js';
import { modelExportTexturePlace, type ModelExportTextures } from '@/io/export/model_export_textures.js';

/**
 * Places the image of every FBX map record (see modelExportTexturePlace) and
 * sets the path each record names: embedded images become the record's content,
 * copied images are returned as files. Call this before the FBX document is
 * written.
 *
 * @param maps Map records from the surface registry (file names may change).
 * @param textures Export texture mode.
 * @returns Texture files to write beside the model.
 */
export async function encodeFbxTextureFiles(
  maps: readonly FbxMapRecord[],
  textures: ModelExportTextures,
): Promise<FbxExportTextureFile[]> {
  const files: FbxExportTextureFile[] = [];
  for (const map of maps) {
    const placement = await modelExportTexturePlace(map.texture, map.fileName, textures);
    if (placement === null) continue;
    if (placement.kind === 'embedded') {
      map.fileName = placement.fileName;
      map.content = new Uint8Array(await placement.blob.arrayBuffer());
    } else {
      map.fileName = placement.path;
      files.push({ fileName: placement.path, blob: placement.blob });
    }
  }
  return files;
}
