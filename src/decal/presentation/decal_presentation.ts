import * as THREE from 'three';
import type { SolidBrushMeshChunk } from '@/solid/mesh/solid_brush_mesh_chunk.js';
import { decalFragmentsEqual, type DecalFragment } from '@/decal/fragment/decal_fragment.js';
import type { BuilderDecalFragment } from '@/decal/fragment/builder_decal_fragment.js';
import { decalChunkBounds } from '@/decal/fragment/decal_chunk_bounds.js';
import { DecalProjectorSettingsStore, type DecalProjectorSettings } from '@/decal/settings/decal_projector_settings.js';
import { DecalPresentationMaterial, DECAL_PRESENTATION_RENDER_ORDER_BASE } from './decal_presentation_material.js';
import { DecalPresentationGeometry, type DecalGeometryTools } from './decal_presentation_geometry.js';
import { DecalProjectionState } from './decal_projection_state.js';

/** UserData flag on the meshes that draw decals. */
export const DECAL_PRESENTATION_USERDATA_KEY = 'isDecalPresentation';

/** Decals per layer that keep a distinct render order. */
const DECAL_PRESENTATION_ORDERS_PER_LAYER = 4096;

/**
 * Draws one decal projector on one solid model. Keeps one fragment per brush
 * the decal reaches and recuts only the brushes whose chunk changed.
 */
export class DecalPresentation {
  /** Mesh that draws the decal, in the result mesh's space. */
  readonly mesh: THREE.Mesh;
  /**
   * Material the decal draws with. Kept apart from the mesh because view modes
   * and other editor passes may swap the mesh's material for a while.
   */
  private readonly material: DecalPresentationMaterial;
  private stackRank = 0;
  private readonly projection = new DecalProjectionState();
  private readonly fragmentsByBrushId = new Map<string, DecalFragment>();
  private readonly pendingBrushIds = new Set<string>();
  private settings: DecalProjectorSettings;
  private appearanceKey = '';
  private geometryOutdated = true;

  /**
   * Creates the presentation of a projector.
   *
   * @param projector Decal projector volume.
   * @param image Initial image texture.
   */
  constructor(
    readonly projector: THREE.Object3D,
    image: THREE.Texture,
  ) {
    this.settings = DecalProjectorSettingsStore.read(projector);
    this.material = new DecalPresentationMaterial(image);
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.name = 'Decal Presentation';
    this.mesh.userData[DECAL_PRESENTATION_USERDATA_KEY] = true;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.raycast = () => undefined;
  }

  /**
   * Re-reads the settings and pose. When the projection changed every brush the
   * projector now reaches, or reached before, is queued for recutting.
   *
   * @param resultMesh Solid model result mesh.
   * @param chunks Current chunk of every brush.
   * @returns True when the projection changed.
   */
  projectionRefresh(resultMesh: THREE.Object3D, chunks: ReadonlyMap<string, SolidBrushMeshChunk>): boolean {
    this.settings = DecalProjectorSettingsStore.read(this.projector);
    const geometryKey = DecalProjectorSettingsStore.geometryKey(this.settings);
    if (!this.projection.refresh(this.projector, resultMesh, this.settings, geometryKey)) return false;
    for (const brushId of this.fragmentsByBrushId.keys()) this.pendingBrushIds.add(brushId);
    for (const [brushId, chunk] of chunks) this.chunkChangeNote(brushId, chunk);
    this.geometryOutdated = true;
    return true;
  }

  /**
   * Queues a brush for recutting when its old or new chunk concerns this decal.
   *
   * @param brushId Brush id.
   * @param chunk New chunk, or undefined when the brush has none any more.
   */
  chunkChangeNote(brushId: string, chunk: SolidBrushMeshChunk | undefined): void {
    if (this.fragmentsByBrushId.has(brushId)) {
      this.pendingBrushIds.add(brushId);
      return;
    }
    if (chunk && decalChunkBounds(chunk).intersectsBox(this.projection.modelBounds)) this.pendingBrushIds.add(brushId);
  }

  /**
   * Returns whether brushes wait to be recut.
   *
   * @returns True when the queue is not empty.
   */
  hasPendingWork(): boolean {
    return this.pendingBrushIds.size > 0 || this.geometryOutdated;
  }

  /**
   * Recuts every queued brush. The geometry is marked outdated only when a
   * fragment actually differs from the one it replaces.
   *
   * @param chunks Current chunk of every brush.
   * @param builder Fragment builder.
   */
  pendingCut(chunks: ReadonlyMap<string, SolidBrushMeshChunk>, builder: BuilderDecalFragment): void {
    if (this.pendingBrushIds.size === 0) return;
    builder.projectionSet(this.projection.projection());
    for (const brushId of this.pendingBrushIds) {
      if (this.brushCut(brushId, chunks.get(brushId), builder)) this.geometryOutdated = true;
    }
    this.pendingBrushIds.clear();
  }

  /**
   * Recuts one brush.
   *
   * @param brushId Brush id.
   * @param chunk Current chunk, or undefined when the brush has none.
   * @param builder Fragment builder holding this decal's projection.
   * @returns True when the brush's fragment changed.
   */
  private brushCut(brushId: string, chunk: SolidBrushMeshChunk | undefined, builder: BuilderDecalFragment): boolean {
    const fragment =
      chunk && decalChunkBounds(chunk).intersectsBox(this.projection.modelBounds) ? builder.build(chunk) : null;
    const previous = this.fragmentsByBrushId.get(brushId);
    if (decalFragmentsEqual(previous, fragment)) return false;
    if (fragment) this.fragmentsByBrushId.set(brushId, fragment);
    else this.fragmentsByBrushId.delete(brushId);
    return true;
  }

  /**
   * Rebuilds the drawn geometry when fragments changed. Surface meshes are
   * lifted by their stacking height; first-hit decals drop shielded parts;
   * stickers unfold.
   *
   * @param tools Geometry helpers shared by the layer.
   * @returns True when the geometry was rebuilt.
   */
  geometryCommit(tools: DecalGeometryTools): boolean {
    if (!this.geometryOutdated) return false;
    this.geometryOutdated = false;
    const projection = this.projection.projection();
    const joined = DecalPresentationGeometry.arrays(
      this.fragmentsByBrushId.values(),
      {
        firstHitOnly: this.settings.firstHitOnly,
        unfoldSticker: DecalProjectorSettingsStore.unfolds(this.settings),
        liftDistance: DecalProjectorSettingsStore.liftOffset(this.settings, this.stackRank),
        frame: projection,
        window: this.settings.window,
      },
      tools,
    );
    this.mesh.geometry.dispose();
    this.mesh.geometry = DecalPresentationGeometry.geometryOf(joined);
    return true;
  }

  /**
   * Sets how many decals stack below this one; a change re-lifts the geometry.
   *
   * @param rank Stacking rank.
   */
  stackRankSet(rank: number): void {
    if (rank === this.stackRank) return;
    this.stackRank = rank;
    this.geometryOutdated = true;
  }

  /**
   * Applies changed appearance settings and the stacking order.
   *
   * @param sceneOrder Position of the projector among the scene's projectors.
   * @param resolveImage Resolver of a settings texture id to an image.
   */
  appearanceRefresh(sceneOrder: number, resolveImage: (textureId: string) => THREE.Texture): void {
    this.mesh.renderOrder =
      DECAL_PRESENTATION_RENDER_ORDER_BASE + this.settings.layer * DECAL_PRESENTATION_ORDERS_PER_LAYER + sceneOrder;
    const key = DecalProjectorSettingsStore.appearanceKey(this.settings);
    if (key === this.appearanceKey) return;
    this.appearanceKey = key;
    this.material.appearanceApply(this.settings, resolveImage(this.settings.textureId));
  }

  /**
   * Returns the number of brushes that currently carry part of the decal.
   *
   * @returns Fragment count.
   */
  fragmentCount(): number {
    return this.fragmentsByBrushId.size;
  }

  /**
   * Returns the number of triangles the decal draws.
   *
   * @returns Triangle count.
   */
  triangleCount(): number {
    const position = this.mesh.geometry.getAttribute('position');
    return position ? position.count / 3 : 0;
  }

  /** Detaches the mesh and frees its geometry and material. */
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
