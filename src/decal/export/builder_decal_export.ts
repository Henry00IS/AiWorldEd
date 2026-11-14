import * as THREE from 'three';
import type { SolidBrushMeshChunk } from '@/solid/mesh/solid_brush_mesh_chunk.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { BuilderDecalFragment } from '@/decal/fragment/builder_decal_fragment.js';
import type { DecalFragment } from '@/decal/fragment/decal_fragment.js';
import { decalChunkBounds } from '@/decal/fragment/decal_chunk_bounds.js';
import { DecalSurfaceLift } from '@/decal/surface/decal_surface_lift.js';
import { DecalStickerUnfold } from '@/decal/surface/decal_sticker_unfold.js';
import { DecalFirstHitMask } from '@/decal/occlusion/decal_first_hit_mask.js';
import { DecalFirstHitTrim } from '@/decal/occlusion/decal_first_hit_trim.js';
import { DecalProjectorSettingsStore, type DecalProjectorSettings } from '@/decal/settings/decal_projector_settings.js';
import { DecalProjectionState } from '@/decal/presentation/decal_projection_state.js';
import {
  DecalPresentationGeometry,
  type DecalGeometryTools,
} from '@/decal/presentation/decal_presentation_geometry.js';
import { DECAL_PRESENTATION_RENDER_ORDER_BASE } from '@/decal/presentation/decal_presentation_material.js';
import { DecalSceneSync } from '@/decal/scene/decal_scene_sync.js';

/** UserData flag on exported decal meshes. */
export const DECAL_EXPORT_USERDATA_KEY = 'isDecalExport';

/**
 * Extra lift per stacking rank, in model units. The editor stacks overlapping
 * decals by draw order and offsets Projector decals on the GPU, neither of
 * which a mesh file carries, so the export bakes both into geometry: every
 * decal rises by its lift distance plus this step for each decal below it.
 */
export const DECAL_EXPORT_STACK_STEP = 0.0005;

/**
 * Builds the decal meshes an export writes for one solid model. Decals are cut
 * in full from the model's current brush chunks, independent of the live
 * per-frame budget, and every decal, Projector mode included, is lifted off its
 * surfaces by its lift distance plus a small step per stacking rank, so engines
 * draw it and its overlaps without depth fighting.
 */
export class BuilderDecalExport {
  private readonly builder = new BuilderDecalFragment();
  private readonly tools: DecalGeometryTools = {
    lift: new DecalSurfaceLift(),
    mask: new DecalFirstHitMask(),
    trim: new DecalFirstHitTrim(),
    unfold: new DecalStickerUnfold(),
  };

  /**
   * Creates the builder.
   *
   * @param resolveImage Resolves a decal texture id to its image.
   */
  constructor(private readonly resolveImage: (textureId: string) => THREE.Texture) {}

  /**
   * Builds the decal meshes of a model in the space of its result mesh's
   * parent, ready to sit under the exported model mesh.
   *
   * @param model Solid model.
   * @param sceneRoot Root that holds the model and the decal projectors.
   * @returns Export meshes, one per decal that reaches the model.
   */
  meshesFor(model: SolidModel, sceneRoot: THREE.Object3D): THREE.Mesh[] {
    const resultMesh = model.getResultMesh();
    sceneRoot.updateMatrixWorld(true);
    const projectors = DecalSceneSync.projectorsCollect(sceneRoot);
    if (projectors.length === 0) return [];
    const chunks: SolidBrushMeshChunk[] = [];
    model.getCollisionChunkSource().forEachCollisionChunk((_brushId, chunk) => chunks.push(chunk));
    resultMesh.updateMatrix();
    const meshes: THREE.Mesh[] = [];
    const ranks = decalExportStackRanks(projectors);
    projectors.forEach((projector, order) => {
      const mesh = this.meshFor(projector, resultMesh, chunks, { order, rank: ranks[order] ?? 0 });
      if (mesh) meshes.push(mesh);
    });
    return meshes;
  }

  /**
   * Builds the export mesh of one decal on one model.
   *
   * @param projector Decal projector.
   * @param resultMesh Result mesh of the model.
   * @param chunks Brush chunks of the model.
   * @param place Scene order of the projector and its stacking rank.
   * @returns Export mesh, or null when the decal misses the model.
   */
  private meshFor(
    projector: THREE.Object3D,
    resultMesh: THREE.Mesh,
    chunks: readonly SolidBrushMeshChunk[],
    place: { order: number; rank: number },
  ): THREE.Mesh | null {
    const settings = DecalProjectorSettingsStore.read(projector);
    const state = new DecalProjectionState();
    state.refresh(projector, resultMesh, settings, DecalProjectorSettingsStore.geometryKey(settings));
    const fragments = this.fragmentsCut(state, chunks);
    const joined = DecalPresentationGeometry.arrays(
      fragments,
      {
        firstHitOnly: settings.firstHitOnly,
        unfoldSticker: DecalProjectorSettingsStore.unfolds(settings),
        liftDistance: settings.liftDistance + place.rank * DECAL_EXPORT_STACK_STEP,
        frame: state.projection(),
      },
      this.tools,
    );
    if (joined.positions.length === 0) return null;
    const geometry = DecalPresentationGeometry.geometryOf(joined).applyMatrix4(resultMesh.matrix);
    const mesh = new THREE.Mesh(geometry, this.materialFor(settings));
    mesh.name = `${projector.name || 'Decal'} Decal`;
    mesh.renderOrder = DECAL_PRESENTATION_RENDER_ORDER_BASE + settings.layer * 4096 + place.order;
    mesh.userData[DECAL_EXPORT_USERDATA_KEY] = true;
    return mesh;
  }

  /**
   * Cuts a decal from every chunk its box reaches.
   *
   * @param state Projection of the decal on the model.
   * @param chunks Brush chunks of the model.
   * @returns Fragments.
   */
  private fragmentsCut(state: DecalProjectionState, chunks: readonly SolidBrushMeshChunk[]): DecalFragment[] {
    this.builder.projectionSet(state.projection());
    const fragments: DecalFragment[] = [];
    for (const chunk of chunks) {
      if (!decalChunkBounds(chunk).intersectsBox(state.modelBounds)) continue;
      const fragment = this.builder.build(chunk);
      if (fragment) fragments.push(fragment);
    }
    return fragments;
  }

  /**
   * Creates the matte, see-through material an exported decal carries.
   *
   * @param settings Decal settings.
   * @returns Standard material with the decal image.
   */
  private materialFor(settings: DecalProjectorSettings): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      map: this.resolveImage(settings.textureId),
      transparent: true,
      opacity: settings.opacity,
      depthWrite: false,
      metalness: 0,
      roughness: 1,
    });
    material.name = `decal_${settings.textureId || 'checker'}`;
    return material;
  }
}

/**
 * Returns the stacking rank of every projector, by layer then scene order, the
 * order the editor draws them in.
 *
 * @param projectors Projectors in scene order.
 * @returns Rank per projector, 0 for the lowest.
 */
function decalExportStackRanks(projectors: readonly THREE.Object3D[]): number[] {
  const layers = projectors.map((projector) => DecalProjectorSettingsStore.read(projector).layer);
  const sorted = projectors.map((_, index) => index).sort((a, b) => (layers[a] ?? 0) - (layers[b] ?? 0) || a - b);
  const ranks: number[] = [];
  sorted.forEach((index, rank) => (ranks[index] = rank));
  return ranks;
}
