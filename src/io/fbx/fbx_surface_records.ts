import * as THREE from 'three';
import { ModelExportMaterialNames } from '@/io/export/model_export_material_names.js';
import { ModelExportTextureNames, modelExportTextureKey } from '@/io/export/model_export_texture_names.js';
import { isDefaultSurfaceTexture } from '@/texture/library/factory_debug_texture.js';
import type { FbxNodeIdPool } from './fbx_node_id_pool.js';

/** Surface (material) and map records collected while walking the export graph. */

/** Diffuse map record with a stable relative file name. */
export interface FbxMapRecord {
  /** FBX Texture object id. */
  textureId: number;
  /** FBX Video (media) object id. */
  videoId: number;
  /** Display name without extension. */
  displayName: string;
  /**
   * Image path relative to the .fbx (extension follows the image format), or
   * the image's name when it is embedded.
   */
  fileName: string;
  /** Source texture (original file or PNG encoding). */
  texture: THREE.Texture;
  /** Image bytes written into the file, or null for an external image. */
  content: Uint8Array | null;
}

/** Material record with optional linked diffuse map. */
export interface FbxSurfaceRecord {
  /** FBX Material object id. */
  materialId: number;
  /** Material display name. */
  displayName: string;
  /** Diffuse RGB in 0–1 linear range. */
  diffuseColor: { r: number; g: number; b: number };
  /** Opacity 0–1. */
  opacity: number;
  /** Linked map record, or null when color-only. */
  map: FbxMapRecord | null;
}

/**
 * Deduplicates materials and maps, allocates FBX ids, and wires texture →
 * material property links.
 */
export class FbxSurfaceRegistry {
  private readonly surfacesByKey = new Map<string, FbxSurfaceRecord>();
  private readonly mapsByTexture = new Map<string, FbxMapRecord>();
  private readonly surfaceNames = new ModelExportMaterialNames('Surface');
  private readonly mapNames = new ModelExportTextureNames('map');
  private readonly orderedSurfaces: FbxSurfaceRecord[] = [];
  private readonly orderedMaps: FbxMapRecord[] = [];

  /** @param idPool Shared id and connection pool for this export. */
  constructor(private readonly idPool: FbxNodeIdPool) {}

  /**
   * Registers materials on a mesh and returns ordered surface records matching
   * the mesh material array.
   *
   * @param mesh Export mesh.
   * @returns Ordered surfaces for material slot indices.
   */
  registerMeshSurfaces(mesh: THREE.Mesh): FbxSurfaceRecord[] {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.map((material, index) => this.registerOneSurface(material, mesh.name, index));
  }

  /**
   * Returns unique surfaces in registration order.
   *
   * @returns Surface records.
   */
  getSurfaces(): readonly FbxSurfaceRecord[] {
    return this.orderedSurfaces;
  }

  /**
   * Returns unique maps in registration order.
   *
   * @returns Map records.
   */
  getMaps(): readonly FbxMapRecord[] {
    return this.orderedMaps;
  }

  /**
   * Registers one material and returns its surface record.
   *
   * @param material Export material.
   * @param meshName Owning mesh name for naming fallbacks.
   * @param materialIndex Multi-material index.
   * @returns Surface record.
   */
  private registerOneSurface(material: THREE.Material, meshName: string, materialIndex: number): FbxSurfaceRecord {
    const color = readDiffuseColor(material);
    const mapTexture = readDiffuseMap(material);
    const key = buildSurfaceKey(color, mapTexture, material.uuid, material.opacity);
    const existing = this.surfacesByKey.get(key);
    if (existing) return existing;
    const map = mapTexture ? this.registerMap(mapTexture, material) : null;
    const surface: FbxSurfaceRecord = {
      materialId: this.idPool.takeId(),
      displayName: this.surfaceNames.nameOf(material, meshName, materialIndex),
      diffuseColor: { r: color.r, g: color.g, b: color.b },
      opacity: Number.isFinite(material.opacity) ? material.opacity : 1,
      map,
    };
    this.surfacesByKey.set(key, surface);
    this.orderedSurfaces.push(surface);
    if (map) {
      this.idPool.linkProperty(map.textureId, surface.materialId, 'DiffuseColor');
    }
    return surface;
  }

  /**
   * Registers or reuses a diffuse map and its Texture/Video pair.
   *
   * @param texture Diffuse map.
   * @param material Owning material for naming.
   * @returns Map record.
   */
  private registerMap(texture: THREE.Texture, material: THREE.Material): FbxMapRecord {
    const existing = this.mapsByTexture.get(modelExportTextureKey(texture));
    if (existing) return existing;
    const displayName = this.mapNames.stemOf(texture, material);
    const fileName = `${displayName}.png`;
    const textureId = this.idPool.takeId();
    const videoId = this.idPool.takeId();
    const record: FbxMapRecord = { textureId, videoId, displayName, fileName, texture, content: null };
    this.mapsByTexture.set(modelExportTextureKey(texture), record);
    this.orderedMaps.push(record);
    this.idPool.linkChildToParent(videoId, textureId);
    return record;
  }
}

/**
 * Builds a dedupe key for color, opacity, and map identity.
 *
 * @param color Diffuse color.
 * @param map Optional map.
 * @param materialUuid Fallback when no map.
 * @param opacity Material opacity.
 * @returns Map key string.
 */
function buildSurfaceKey(color: THREE.Color, map: THREE.Texture | null, materialUuid: string, opacity: number): string {
  const mapKey = map ? `map:${modelExportTextureKey(map)}` : `noremap:${materialUuid}`;
  return `${color.getHexString()}:${opacity}:${mapKey}`;
}

/**
 * Reads diffuse color from a material, defaulting to white.
 *
 * @param material Material to inspect.
 * @returns Diffuse color.
 */
function readDiffuseColor(material: THREE.Material): THREE.Color {
  if ('color' in material && material.color instanceof THREE.Color) {
    return material.color;
  }
  return new THREE.Color(0xffffff);
}

/**
 * Reads the albedo map when present and backed by an image.
 *
 * @param material Material to inspect.
 * @returns Texture or null.
 */
function readDiffuseMap(material: THREE.Material): THREE.Texture | null {
  const mapHost = material as THREE.Material & { map?: THREE.Texture | null };
  const map = mapHost.map ?? null;
  if (!map || !map.image) return null;
  if (isDefaultSurfaceTexture(map)) return null;
  if (map instanceof THREE.CanvasTexture) return null;
  return map;
}
