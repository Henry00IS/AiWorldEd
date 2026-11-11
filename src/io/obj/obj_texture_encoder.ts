import type { ObjExportTextureFile } from './obj_export_types.js';
import type { ObjMaterialSlot } from './obj_material_collector.js';
import { modelExportTexturePlace, type ModelExportTextures } from '@/io/export/model_export_textures.js';

/**
 * Places the diffuse map of every material slot (see modelExportTexturePlace)
 * and sets the path the .mtl names, for every slot sharing the map (slots of
 * the same texture share its file name). Call this before writing the .mtl.
 *
 * @param slots Material slots that may reference maps.
 * @param textures Export texture mode (OBJ cannot embed).
 * @returns Texture files to write beside the model.
 */
export async function encodeObjTextureFiles(
  slots: readonly ObjMaterialSlot[],
  textures: ModelExportTextures,
): Promise<ObjExportTextureFile[]> {
  if (textures.mode === 'embedded') throw new Error('OBJ cannot embed textures');
  const files: ObjExportTextureFile[] = [];
  const placed = new Set<string>();
  for (const slot of slots) {
    const name = slot.mapFileName;
    if (!slot.map || !name || placed.has(name)) continue;
    placed.add(name);
    const placement = await modelExportTexturePlace(slot.map, name, textures);
    if (placement === null || placement.kind === 'embedded') continue;
    const path = placement.path;
    placed.add(path);
    for (const other of slots) if (other.mapFileName === name) other.mapFileName = path;
    files.push({ fileName: path, blob: placement.blob });
  }
  return files;
}
