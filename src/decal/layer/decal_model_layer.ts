import type * as THREE from 'three';
import type { SolidBrushMeshChunk } from '@/solid/mesh/solid_brush_mesh_chunk.js';
import type { SolidCollisionChunkSource } from '@/solid/mesh/solid_collision_chunk_source.js';
import { BuilderDecalFragment } from '@/decal/fragment/builder_decal_fragment.js';
import { DecalSurfaceLift } from '@/decal/surface/decal_surface_lift.js';
import { DecalPresentation } from '@/decal/presentation/decal_presentation.js';
import { DecalProjectorSettingsStore } from '@/decal/settings/decal_projector_settings.js';
import type { DecalLayerSyncReport } from './decal_layer_sync_report.js';

/** Services a decal layer needs from its owner. */
export interface DecalModelLayerServices {
  /** Resolves a settings texture id to an image. */
  resolveImage: (textureId: string) => THREE.Texture;
  /** Returns a monotonic time in milliseconds. */
  now: () => number;
}

/**
 * Draws every decal projector on one solid model. Tracks which brush chunks
 * changed since the last pass and hands only those to the decals they concern.
 */
export class DecalModelLayer {
  private readonly chunksByBrushId = new Map<string, SolidBrushMeshChunk>();
  private readonly presentations = new Map<THREE.Object3D, DecalPresentation>();
  private readonly builder = new BuilderDecalFragment();
  private readonly lift = new DecalSurfaceLift();
  private seenRevision = -1;

  /**
   * Creates a layer for one solid model.
   *
   * @param resultMesh Result mesh the decal meshes are attached to.
   * @param chunkSource Per-brush chunk access of the model.
   * @param services Image resolver and clock.
   */
  constructor(
    private readonly resultMesh: THREE.Mesh,
    private readonly chunkSource: SolidCollisionChunkSource,
    private readonly services: DecalModelLayerServices,
  ) {}

  /**
   * Brings every decal up to date with the model and the projectors. At least
   * one decal is recut per pass; further decals are recut only while the budget
   * lasts and the rest continue next pass.
   *
   * @param projectors Visible decal projectors in stacking order.
   * @param budgetMilliseconds Time allowed for recutting.
   * @param report Report receiving this pass's work counts.
   */
  sync(projectors: readonly THREE.Object3D[], budgetMilliseconds: number, report: DecalLayerSyncReport): void {
    const deadline = this.services.now() + budgetMilliseconds;
    const rebuiltBefore = report.rebuiltDecals;
    this.chunkChangesDistribute(report);
    this.presentationsPrune(projectors);
    for (let order = 0; order < projectors.length; order++) {
      const projector = projectors[order];
      if (!projector) continue;
      const presentation = this.presentationEnsure(projector);
      presentation.projectionRefresh(this.resultMesh, this.chunksByBrushId);
      presentation.appearanceRefresh(order, this.services.resolveImage);
      if (!presentation.hasPendingWork()) continue;
      if (report.rebuiltDecals > rebuiltBefore && this.services.now() > deadline) {
        report.deferredDecals++;
        continue;
      }
      this.presentationUpdate(presentation, report);
    }
  }

  /**
   * Recuts a decal's queued brushes and rebuilds its geometry.
   *
   * @param presentation Decal presentation.
   * @param report Report receiving the work counts.
   */
  private presentationUpdate(presentation: DecalPresentation, report: DecalLayerSyncReport): void {
    presentation.pendingCut(this.chunksByBrushId, this.builder);
    if (presentation.geometryCommit(this.lift)) report.rebuiltDecals++;
  }

  /**
   * Finds chunks that changed since the last pass and tells every decal.
   *
   * @param report Report receiving the changed brush count.
   */
  private chunkChangesDistribute(report: DecalLayerSyncReport): void {
    const revision = this.chunkSource.getCollisionRevision();
    if (revision === this.seenRevision) return;
    this.seenRevision = revision;
    const changed = this.chunkChangesCollect();
    report.changedBrushes += changed.size;
    for (const presentation of this.presentations.values()) {
      for (const [brushId, chunk] of changed) presentation.chunkChangeNote(brushId, chunk);
    }
  }

  /**
   * Updates the chunk map from the model and returns what changed.
   *
   * @returns Changed brush ids with their new chunk, or undefined when removed.
   */
  private chunkChangesCollect(): Map<string, SolidBrushMeshChunk | undefined> {
    const changed = new Map<string, SolidBrushMeshChunk | undefined>();
    const present = new Set<string>();
    this.chunkSource.forEachCollisionChunk((brushId, chunk) => {
      present.add(brushId);
      if (this.chunksByBrushId.get(brushId) === chunk) return;
      this.chunksByBrushId.set(brushId, chunk);
      changed.set(brushId, chunk);
    });
    for (const brushId of this.chunksByBrushId.keys()) {
      if (present.has(brushId)) continue;
      this.chunksByBrushId.delete(brushId);
      changed.set(brushId, undefined);
    }
    return changed;
  }

  /**
   * Returns the presentation of a projector, creating and attaching it first.
   *
   * @param projector Decal projector volume.
   * @returns Presentation.
   */
  private presentationEnsure(projector: THREE.Object3D): DecalPresentation {
    const known = this.presentations.get(projector);
    if (known) return known;
    const presentation = new DecalPresentation(
      projector,
      this.services.resolveImage(DecalProjectorSettingsStore.read(projector).textureId),
    );
    this.presentations.set(projector, presentation);
    this.resultMesh.add(presentation.mesh);
    return presentation;
  }

  /**
   * Disposes presentations whose projector is no longer listed.
   *
   * @param projectors Current projectors.
   */
  private presentationsPrune(projectors: readonly THREE.Object3D[]): void {
    if (this.presentations.size === 0) return;
    const listed = new Set(projectors);
    for (const [projector, presentation] of this.presentations) {
      if (listed.has(projector)) continue;
      presentation.dispose();
      this.presentations.delete(projector);
    }
  }

  /**
   * Returns the presentation of a projector, if the layer has one.
   *
   * @param projector Decal projector volume.
   * @returns Presentation or undefined.
   */
  presentationOf(projector: THREE.Object3D): DecalPresentation | undefined {
    return this.presentations.get(projector);
  }

  /** Disposes every presentation. */
  dispose(): void {
    for (const presentation of this.presentations.values()) presentation.dispose();
    this.presentations.clear();
  }
}
