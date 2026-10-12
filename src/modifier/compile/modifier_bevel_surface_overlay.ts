import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidBrushMeshChunk } from '@/solid/mesh/solid_brush_mesh_chunk.js';
import type { ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
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
