import * as THREE from 'three';
import { ModelExportMaterialNames } from '@/io/export/model_export_material_names.js';
import { ModelExportTextureNames, modelExportTextureKey } from '@/io/export/model_export_texture_names.js';

/** Material slot used when writing usemtl / newmtl entries. */
export interface ObjMaterialSlot {
  /** Stable Wavefront material name (no spaces). */
  name: string;
  /** Diffuse color. */
  color: THREE.Color;
  /** Optional albedo map; null when color-only. */
  map: THREE.Texture | null;
  /** Relative image file name when map is exported, otherwise null. */
  mapFileName: string | null;
}

/**
 * Collects unique materials from an export scene and assigns stable names and
 * map file names for Wavefront MTL output.
 */
export class ObjMaterialCollector {
  private readonly slotsByKey = new Map<string, ObjMaterialSlot>();
  private readonly materialNames = new ModelExportMaterialNames('Material');
  private readonly mapNames = new ModelExportTextureNames('texture');

  /**
   * Registers materials on a mesh and returns the slot list for that mesh
   * (single material or multi-material array order).
   *
   * @param mesh Export mesh.
   * @returns Ordered material slots for the mesh.
   */
  registerMeshMaterials(mesh: THREE.Mesh): ObjMaterialSlot[] {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.map((material, index) => this.registerOneMaterial(material, mesh.name, index));
  }

  /**
   * Returns every unique material slot collected so far.
   *
   * @returns Material slots in insertion order.
   */
  getSlots(): ObjMaterialSlot[] {
    return Array.from(this.slotsByKey.values());
  }

  /**
   * Registers one Three.js material and returns its slot.
   *
   * @param material Live or export material.
   * @param meshName Owning mesh name for fallback naming.
   * @param materialIndex Index within a multi-material array.
   * @returns Unique material slot.
   */
  private registerOneMaterial(material: THREE.Material, meshName: string, materialIndex: number): ObjMaterialSlot {
    const color = this.readDiffuseColor(material);
    const map = this.readDiffuseMap(material);
    const key = this.buildMaterialKey(color, map, material.uuid);
    const existing = this.slotsByKey.get(key);
    if (existing) return existing;
    const slot: ObjMaterialSlot = {
      name: this.materialNames.nameOf(material, meshName, materialIndex),
      color: color.clone(),
      map,
      mapFileName: map ? this.allocateMapFileName(map, material) : null,
    };
    this.slotsByKey.set(key, slot);
    return slot;
  }

  /**
   * Builds a dedupe key for color + map identity.
   *
   * @param color Diffuse color.
   * @param map Optional map.
   * @param materialUuid Fallback uuid when no map.
   * @returns Map key string.
   */
  private buildMaterialKey(color: THREE.Color, map: THREE.Texture | null, materialUuid: string): string {
    const mapKey = map ? `map:${modelExportTextureKey(map)}` : `noremap:${materialUuid}`;
    return `${color.getHexString()}:${mapKey}`;
  }

  /**
   * Reads the diffuse color from a material, defaulting to white.
   *
   * @param material Material to inspect.
   * @returns Diffuse color.
   */
  private readDiffuseColor(material: THREE.Material): THREE.Color {
    if ('color' in material && material.color instanceof THREE.Color) {
      return material.color;
    }
    return new THREE.Color(0xffffff);
  }

  /**
   * Reads the albedo map when present and not a missing image.
   *
   * @param material Material to inspect.
   * @returns Texture map or null.
   */
  private readDiffuseMap(material: THREE.Material): THREE.Texture | null {
    const mapHost = material as THREE.Material & { map?: THREE.Texture | null };
    const map = mapHost.map ?? null;
    if (!map || !map.image) return null;
    return map;
  }

  /**
   * Allocates a unique relative image file name for a map.
   *
   * @param map Diffuse map.
   * @param material Owning material.
   * @returns File name such as brick.png.
   */
  private allocateMapFileName(map: THREE.Texture, material: THREE.Material): string {
    return `${this.mapNames.stemOf(map, material)}.png`;
  }
}
