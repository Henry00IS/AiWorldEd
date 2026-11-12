import type * as THREE from 'three';

/**
 * Gives each material of one export a name: its own name, else "<mesh>_<slot>",
 * made safe as a token (no spaces or path separators). Two materials with the
 * same name get "_2", "_3" and so on in the order they are met. FBX, OBJ and
 * glTF exports name their materials this way.
 */
export class ModelExportMaterialNames {
  private readonly used = new Set<string>();

  /**
   * Creates the names of one export.
   *
   * @param fallback Name used when neither the material nor its mesh has one.
   */
  constructor(private readonly fallback: string) {}

  /**
   * Allocates the name of a material.
   *
   * @param material Material.
   * @param meshName Name of the mesh showing it.
   * @param materialIndex Its slot in the mesh's material array.
   * @returns Unique safe name.
   */
  nameOf(material: THREE.Material, meshName: string, materialIndex: number): string {
    const preferred = material.name?.trim() || `${meshName || this.fallback}_${materialIndex}`;
    const base = modelExportMaterialNameSanitize(preferred) || this.fallback;
    let name = base;
    for (let suffix = 2; this.used.has(name); suffix++) name = `${base}_${suffix}`;
    this.used.add(name);
    return name;
  }
}

/**
 * Turns a free-form name into a token without spaces, path or extension.
 *
 * @param raw Raw name.
 * @returns Safe token, possibly empty.
 */
export function modelExportMaterialNameSanitize(raw: string): string {
  return raw
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .pop()!
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
