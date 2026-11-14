import * as THREE from 'three';
import type { DecalFragmentProjection } from '@/decal/fragment/builder_decal_fragment.js';

/** Corners of the unit projector box, used to measure its model-space bounds. */
const DECAL_PROJECTOR_BOX_CORNERS: readonly THREE.Vector3[] = [-0.5, 0.5].flatMap((x) =>
  [-0.5, 0.5].flatMap((y) => [-0.5, 0.5].map((z) => new THREE.Vector3(x, y, z))),
);

/**
 * Where a decal projector sits relative to one solid model, and whether that
 * changed since the last refresh.
 */
export class DecalProjectionState {
  /** Model-space bounds of the projector box. */
  readonly modelBounds = new THREE.Box3();
  private readonly modelToProjector = new THREE.Matrix4();
  private readonly projectorToModel = new THREE.Matrix4();
  private readonly travelDirection = new THREE.Vector3();
  private readonly scratchCorner = new THREE.Vector3();
  private readonly previousElements = new Float64Array(16);
  private previousGeometryKey = '';
  private refreshed = false;
  private minimumFacingCosine = 0;
  private recordsShielding = false;

  /**
   * Recomputes the projection from the projector and result mesh poses.
   *
   * @param projector Decal projector volume.
   * @param resultMesh Solid model result mesh.
   * @param settings Facing limit and first-hit switch of the decal.
   * @param settings.facingLimitDegrees Steepest receiving angle in degrees.
   * @param settings.firstHitOnly True when the decal paints first hits only.
   * @param geometryKey Key of the settings that shape the geometry.
   * @returns True when the projection or those settings changed.
   */
  refresh(
    projector: THREE.Object3D,
    resultMesh: THREE.Object3D,
    settings: { facingLimitDegrees: number; firstHitOnly: boolean },
    geometryKey: string,
  ): boolean {
    this.projectorToModel.copy(resultMesh.matrixWorld).invert().multiply(projector.matrixWorld);
    if (!this.changedSincePrevious(geometryKey)) return false;
    this.modelToProjector.copy(this.projectorToModel).invert();
    this.travelDirection.setFromMatrixColumn(this.projectorToModel, 1).normalize().negate();
    this.minimumFacingCosine = Math.cos(THREE.MathUtils.degToRad(settings.facingLimitDegrees));
    this.recordsShielding = settings.firstHitOnly;
    this.boundsMeasure();
    return true;
  }

  /**
   * Returns the projection the fragment builder needs.
   *
   * @returns Projection description sharing this state's objects.
   */
  projection(): DecalFragmentProjection {
    return {
      modelToProjector: this.modelToProjector,
      travelDirection: this.travelDirection,
      minimumFacingCosine: this.minimumFacingCosine,
      recordsShielding: this.recordsShielding,
    };
  }

  /**
   * Returns the projector-to-model transform.
   *
   * @returns Matrix shared with this state.
   */
  projectorToModelMatrix(): THREE.Matrix4 {
    return this.projectorToModel;
  }

  /**
   * Compares the current projector-to-model matrix and geometry key with the
   * stored ones, and stores the current ones.
   *
   * @param geometryKey Key of the settings that shape the geometry.
   * @returns True when anything differs or nothing was stored yet.
   */
  private changedSincePrevious(geometryKey: string): boolean {
    const elements = this.projectorToModel.elements;
    let changed = !this.refreshed || geometryKey !== this.previousGeometryKey;
    for (let index = 0; index < 16; index++) {
      if (this.previousElements[index] !== elements[index]) changed = true;
      this.previousElements[index] = elements[index] ?? 0;
    }
    this.previousGeometryKey = geometryKey;
    this.refreshed = true;
    return changed;
  }

  /** Measures the model-space bounds of the projector box. */
  private boundsMeasure(): void {
    this.modelBounds.makeEmpty();
    for (const corner of DECAL_PROJECTOR_BOX_CORNERS) {
      this.modelBounds.expandByPoint(this.scratchCorner.copy(corner).applyMatrix4(this.projectorToModel));
    }
  }
}
