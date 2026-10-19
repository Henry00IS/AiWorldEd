import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidBrushMeshChunk } from '@/solid/mesh/solid_brush_mesh_chunk.js';
import type { ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { modifierBevelRecordUsesVolumeTexture } from '@/modifier/bevel/modifier_bevel_face_record.js';
import { modifierBevelResolveDerivedSurface } from '@/modifier/bevel/modifier_bevel_stand_in.js';

/** Derived face records for brushes substituted on the last compile. */
export class ModifierBevelSurfaceOverlay {
  private static readonly records = new Map<string, ModifierBevelDerivedBrush>();

  /**
   * Stores derived face records for one brush.
   *
   * @param brushId Brush id.
   * @param derived Derived brush.
   */
  static set(brushId: string, derived: ModifierBevelDerivedBrush): void {
    ModifierBevelSurfaceOverlay.records.set(brushId, derived);
  }

  /**
   * Drops derived records for one brush.
   *
   * @param brushId Brush id.
   */
  static clear(brushId: string): void {
    ModifierBevelSurfaceOverlay.records.delete(brushId);
  }

  /** Drops every derived record. */
  static clearAll(): void {
    ModifierBevelSurfaceOverlay.records.clear();
  }

  /**
   * Returns the texture a volume asked generated faces to use.
   *
   * @param brushId Brush id.
   * @returns Texture id, or an empty string when the parent texture is kept.
   */
  static textureOverride(brushId: string): string {
    return ModifierBevelSurfaceOverlay.records.get(brushId)?.textureId ?? '';
  }

  /**
   * Keeps a volume texture when the compiled region already carries it.
   *
   * @param brushId Brush id.
   * @param regionTextureId Texture stored on the compiled region.
   * @param mappingTextureId Texture of the authored face mapping.
   * @returns Texture to show.
   */
  static presentedTextureId(brushId: string, regionTextureId: string, mappingTextureId: string): string {
    const override = ModifierBevelSurfaceOverlay.textureOverride(brushId);
    if (override !== '' && regionTextureId === override) return override;
    return mappingTextureId || regionTextureId;
  }

  /**
   * Returns the texture a cached bevel polygon should keep.
   *
   * @param brush Authored brush.
   * @param surfaceIndex Derived face index stored on the polygon.
   * @returns Texture id.
   */
  static textureForCompiledSurface(brush: SolidBrushInstance, surfaceIndex: number): string {
    const derived = ModifierBevelSurfaceOverlay.records.get(brush.id);
    if (!derived) return brush.getSurfaceTextureId(surfaceIndex);
    return modifierBevelCompiledSurfaceTexture(brush, derived, surfaceIndex);
  }

  /**
   * Resolves a live surface for a derived face index.
   *
   * @param brush Authored brush.
   * @param surfaceIndex Derived face index stored on compiled polygons.
   * @returns Surface, or null when this brush was not chamfered.
   */
  static resolve(brush: SolidBrushInstance, surfaceIndex: number): FaceSurfaceDescription | null {
    const derived = ModifierBevelSurfaceOverlay.records.get(brush.id);
    if (!derived) return null;
    return modifierBevelResolveDerivedSurface(brush, derived, surfaceIndex);
  }

  /**
   * Rewrites chunk face indices to the authored parent so face selection
   * follows that face.
   *
   * @param brushId Brush id.
   * @param chunk Chunk whose sources still use derived face indices.
   */
  static remapChunkToParents(brushId: string, chunk: SolidBrushMeshChunk): void {
    const derived = ModifierBevelSurfaceOverlay.records.get(brushId);
    if (!derived) return;
    ModifierBevelSurfaceOverlay.remapSources(chunk, derived);
    ModifierBevelSurfaceOverlay.remapRegions(chunk, derived);
  }

  /**
   * Rewrites triangle sources.
   *
   * @param chunk Chunk to update.
   * @param derived Derived face records.
   */
  private static remapSources(chunk: SolidBrushMeshChunk, derived: ModifierBevelDerivedBrush): void {
    for (const source of chunk.triangleSources) {
      const parent = derived.faces[source.surfaceIndex]?.parentSurfaceIndex;
      if (parent !== undefined && parent >= 0) source.surfaceIndex = parent;
    }
  }

  /**
   * Rewrites surface regions.
   *
   * @param chunk Chunk to update.
   * @param derived Derived face records.
   */
  private static remapRegions(chunk: SolidBrushMeshChunk, derived: ModifierBevelDerivedBrush): void {
    for (const region of chunk.regions) {
      const parent = derived.faces[region.surfaceIndex]?.parentSurfaceIndex;
      if (parent !== undefined && parent >= 0) region.surfaceIndex = parent;
    }
  }
}

/**
 * Keeps a volume texture on generated faces and reads authored faces live.
 *
 * @param brush Authored brush.
 * @param derived Chamfer face records.
 * @param surfaceIndex Derived face index.
 * @returns Texture id.
 */
function modifierBevelCompiledSurfaceTexture(
  brush: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  surfaceIndex: number,
): string {
  const record = derived.faces[surfaceIndex];
  if (derived.textureId && modifierBevelRecordUsesVolumeTexture(record)) return derived.textureId;
  const parent = record?.parentSurfaceIndex;
  if (parent !== undefined && parent >= 0) return brush.getSurfaceTextureId(parent);
  return brush.getSurfaceTextureId(surfaceIndex);
}
